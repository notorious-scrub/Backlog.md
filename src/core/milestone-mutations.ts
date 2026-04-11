import { rename as moveFile } from "node:fs/promises";
import { isLocalEditableTask, type Milestone, type Task } from "../types/index.ts";
import {
	buildMilestoneMatchKeys,
	keySetsIntersect,
	resolveMilestoneStorageValue,
} from "../utils/milestone-resolution.ts";
import { normalizeTaskId, taskIdsEqual } from "../utils/task-path.ts";
import type { Core } from "./backlog.ts";
import { collectArchivedMilestoneKeys, milestoneKey, normalizeMilestoneName } from "./milestones.ts";

export class MilestoneMutationError extends Error {
	constructor(
		message: string,
		public readonly mcpCode: "VALIDATION_ERROR" | "NOT_FOUND" | "INTERNAL_ERROR" = "INTERNAL_ERROR",
	) {
		super(message);
		this.name = "MilestoneMutationError";
	}
}

function formatTaskIdList(taskIds: string[], limit = 20): string {
	if (taskIds.length === 0) return "";
	const shown = taskIds.slice(0, limit);
	const suffix = taskIds.length > limit ? ` (and ${taskIds.length - limit} more)` : "";
	return `${shown.join(", ")}${suffix}`;
}

function findActiveMilestoneByAlias(name: string, milestones: Milestone[]): Milestone | undefined {
	const normalized = normalizeMilestoneName(name);
	const key = milestoneKey(normalized);
	if (!key) {
		return undefined;
	}
	const resolvedId = resolveMilestoneStorageValue(normalized, milestones);
	const resolvedKey = milestoneKey(resolvedId);
	const idMatch = milestones.find((milestone) => milestoneKey(milestone.id) === resolvedKey);
	if (idMatch) {
		return idMatch;
	}
	const titleMatches = milestones.filter((milestone) => milestoneKey(milestone.title) === key);
	return titleMatches.length === 1 ? titleMatches[0] : undefined;
}

function buildTaskMatchKeysForMilestone(name: string, milestone?: Milestone, includeTitleMatch = true): Set<string> {
	if (!milestone) {
		return buildMilestoneMatchKeys(name, []);
	}
	const baseValue = includeTitleMatch ? name : milestone.id;
	const keys = buildMilestoneMatchKeys(baseValue, [milestone]);
	for (const key of buildMilestoneMatchKeys(milestone.id, [milestone])) {
		keys.add(key);
	}
	const titleKey = milestoneKey(milestone.title);
	if (titleKey) {
		if (includeTitleMatch) {
			keys.add(titleKey);
		} else {
			keys.delete(titleKey);
		}
	}
	return keys;
}

function buildMilestoneRecordMatchKeys(milestone: Milestone): Set<string> {
	const keys = buildMilestoneMatchKeys(milestone.id, [milestone]);
	const titleKey = milestoneKey(milestone.title);
	if (titleKey) {
		keys.add(titleKey);
	}
	return keys;
}

function hasMilestoneTitleAliasCollision(sourceMilestone: Milestone, candidates: Milestone[]): boolean {
	const sourceMilestoneIdKey = milestoneKey(sourceMilestone.id);
	const sourceTitleKey = milestoneKey(sourceMilestone.title);
	if (!sourceTitleKey) {
		return false;
	}
	return candidates.some((candidate) => {
		if (milestoneKey(candidate.id) === sourceMilestoneIdKey) {
			return false;
		}
		return buildMilestoneRecordMatchKeys(candidate).has(sourceTitleKey);
	});
}

async function listLocalTasks(core: Core): Promise<Task[]> {
	return await core.queryTasks({ includeCrossBranch: false });
}

async function rollbackTaskMilestones(
	core: Core,
	previousMilestones: Map<string, string | undefined>,
): Promise<string[]> {
	const failedTaskIds: string[] = [];
	for (const [taskId, milestone] of previousMilestones.entries()) {
		try {
			await core.editTask(taskId, { milestone: milestone ?? null }, false);
		} catch {
			failedTaskIds.push(taskId);
		}
	}
	return failedTaskIds.sort((a, b) => a.localeCompare(b));
}

async function commitMilestoneMutation(
	core: Core,
	commitMessage: string,
	options: {
		sourcePath?: string;
		targetPath?: string;
		taskFilePaths?: Iterable<string>;
	},
): Promise<void> {
	const shouldAutoCommit = await core.shouldAutoCommit();
	if (!shouldAutoCommit) {
		return;
	}

	let repoRoot: string | null = null;
	const commitPaths: string[] = [];
	if (options.sourcePath && options.targetPath) {
		repoRoot = await core.git.stageFileMove(options.sourcePath, options.targetPath);
		commitPaths.push(options.sourcePath, options.targetPath);
	}
	for (const filePath of options.taskFilePaths ?? []) {
		await core.git.addFile(filePath);
		commitPaths.push(filePath);
	}
	try {
		await core.git.commitFiles(commitMessage, commitPaths, repoRoot);
	} catch (error) {
		await core.git.resetPaths(commitPaths, repoRoot);
		throw error;
	}
}

export async function addMilestoneForProject(core: Core, name: string, description?: string): Promise<Milestone> {
	const normalized = normalizeMilestoneName(name);
	if (!normalized) {
		throw new MilestoneMutationError("Milestone name cannot be empty.", "VALIDATION_ERROR");
	}

	const existing = await core.filesystem.listMilestones();
	const requestedKeys = buildMilestoneMatchKeys(normalized, existing);
	const duplicate = existing.find((milestone) => {
		const milestoneKeys = buildMilestoneRecordMatchKeys(milestone);
		return keySetsIntersect(requestedKeys, milestoneKeys);
	});
	if (duplicate) {
		throw new MilestoneMutationError(
			`Milestone alias conflict: "${normalized}" matches existing milestone "${duplicate.title}" (${duplicate.id}).`,
			"VALIDATION_ERROR",
		);
	}

	return await core.createMilestone(normalized, description);
}

export async function renameMilestoneForProject(
	core: Core,
	args: { from: string; to: string; updateTasks?: boolean },
): Promise<string> {
	const fromName = normalizeMilestoneName(args.from);
	const toName = normalizeMilestoneName(args.to);
	if (!fromName || !toName) {
		throw new MilestoneMutationError("Both 'from' and 'to' milestone names are required.", "VALIDATION_ERROR");
	}

	const fileMilestones = await core.filesystem.listMilestones();
	const archivedMilestones = await core.filesystem.listArchivedMilestones();
	const sourceMilestone = findActiveMilestoneByAlias(fromName, fileMilestones);
	if (!sourceMilestone) {
		throw new MilestoneMutationError(`Milestone not found: "${fromName}"`, "NOT_FOUND");
	}
	if (toName === sourceMilestone.title.trim()) {
		return `Milestone "${sourceMilestone.title}" (${sourceMilestone.id}) is already named "${sourceMilestone.title}". No changes made.`;
	}
	const hasTitleCollision = hasMilestoneTitleAliasCollision(sourceMilestone, [
		...fileMilestones,
		...archivedMilestones,
	]);

	const targetKeys = buildMilestoneMatchKeys(toName, fileMilestones);
	const aliasConflict = fileMilestones.find(
		(milestone) =>
			milestoneKey(milestone.id) !== milestoneKey(sourceMilestone.id) &&
			keySetsIntersect(targetKeys, buildMilestoneRecordMatchKeys(milestone)),
	);
	if (aliasConflict) {
		throw new MilestoneMutationError(
			`Milestone alias conflict: "${toName}" matches existing milestone "${aliasConflict.title}" (${aliasConflict.id}).`,
			"VALIDATION_ERROR",
		);
	}

	const targetMilestone = sourceMilestone.id;
	const shouldUpdateTasks = args.updateTasks ?? true;
	const tasks = shouldUpdateTasks ? await listLocalTasks(core) : [];
	const matchKeys = shouldUpdateTasks
		? buildTaskMatchKeysForMilestone(fromName, sourceMilestone, !hasTitleCollision)
		: new Set<string>();
	const matches = shouldUpdateTasks ? tasks.filter((task) => matchKeys.has(milestoneKey(task.milestone ?? ""))) : [];
	let updatedTaskIds: string[] = [];
	const updatedTaskFilePaths = new Set<string>();

	const renameResult = await core.renameMilestone(sourceMilestone.id, toName, false);
	if (!renameResult.success || !renameResult.milestone) {
		throw new MilestoneMutationError(`Failed to rename milestone "${sourceMilestone.title}".`, "INTERNAL_ERROR");
	}

	const renamedMilestone = renameResult.milestone;
	const previousMilestones = new Map<string, string | undefined>();
	if (shouldUpdateTasks) {
		try {
			for (const task of matches) {
				previousMilestones.set(task.id, task.milestone);
				const updatedTask = await core.editTask(task.id, { milestone: targetMilestone }, false);
				const taskFilePath = updatedTask.filePath ?? task.filePath;
				if (taskFilePath) {
					updatedTaskFilePaths.add(taskFilePath);
				}
				updatedTaskIds.push(task.id);
			}
			updatedTaskIds = updatedTaskIds.sort((a, b) => a.localeCompare(b));
		} catch {
			const rollbackTaskFailures = await rollbackTaskMilestones(core, previousMilestones);
			const rollbackRenameResult = await core.renameMilestone(sourceMilestone.id, sourceMilestone.title, false);
			const rollbackDetails: string[] = [];
			if (!rollbackRenameResult.success) {
				rollbackDetails.push("failed to rollback milestone file rename");
			}
			if (rollbackTaskFailures.length > 0) {
				rollbackDetails.push(`failed to rollback task milestones for: ${rollbackTaskFailures.join(", ")}`);
			}
			const detailSuffix = rollbackDetails.length > 0 ? ` (${rollbackDetails.join("; ")})` : "";
			throw new MilestoneMutationError(
				`Failed to update task milestones after renaming "${sourceMilestone.title}"${detailSuffix}.`,
				"INTERNAL_ERROR",
			);
		}
	}
	try {
		await commitMilestoneMutation(core, `backlog: Rename milestone ${sourceMilestone.id}`, {
			sourcePath: renameResult.sourcePath,
			targetPath: renameResult.targetPath,
			taskFilePaths: updatedTaskFilePaths,
		});
	} catch {
		const rollbackTaskFailures = await rollbackTaskMilestones(core, previousMilestones);
		const rollbackRenameResult = await core.renameMilestone(sourceMilestone.id, sourceMilestone.title, false);
		const rollbackDetails: string[] = [];
		if (!rollbackRenameResult.success) {
			rollbackDetails.push("failed to rollback milestone file rename");
		}
		if (rollbackTaskFailures.length > 0) {
			rollbackDetails.push(`failed to rollback task milestones for: ${rollbackTaskFailures.join(", ")}`);
		}
		const detailSuffix = rollbackDetails.length > 0 ? ` (${rollbackDetails.join("; ")})` : "";
		throw new MilestoneMutationError(
			`Failed while finalizing milestone rename "${sourceMilestone.title}"${detailSuffix}.`,
			"INTERNAL_ERROR",
		);
	}

	const summaryLines: string[] = [
		`Renamed milestone "${sourceMilestone.title}" (${sourceMilestone.id}) → "${renamedMilestone.title}" (${renamedMilestone.id}).`,
	];
	if (shouldUpdateTasks) {
		summaryLines.push(
			`Updated ${updatedTaskIds.length} local task${updatedTaskIds.length === 1 ? "" : "s"}: ${formatTaskIdList(updatedTaskIds)}`,
		);
	} else {
		summaryLines.push("Skipped updating tasks (updateTasks=false).");
	}
	if (renameResult.sourcePath && renameResult.targetPath && renameResult.sourcePath !== renameResult.targetPath) {
		summaryLines.push(`Renamed milestone file: ${renameResult.sourcePath} -> ${renameResult.targetPath}`);
	}

	return summaryLines.join("\n");
}

export async function editMilestoneForProject(
	core: Core,
	args: { name: string; description: string },
): Promise<string> {
	const name = normalizeMilestoneName(args.name);
	if (!name) {
		throw new MilestoneMutationError("Milestone name cannot be empty.", "VALIDATION_ERROR");
	}
	if (typeof args.description !== "string") {
		throw new MilestoneMutationError("Milestone description is required.", "VALIDATION_ERROR");
	}

	const fileMilestones = await core.filesystem.listMilestones();
	const sourceMilestone = findActiveMilestoneByAlias(name, fileMilestones);
	if (!sourceMilestone) {
		throw new MilestoneMutationError(`Milestone not found: "${name}"`, "NOT_FOUND");
	}
	if (args.description.replace(/\r\n/g, "\n").trim() === sourceMilestone.description.replace(/\r\n/g, "\n").trim()) {
		return `Milestone "${sourceMilestone.title}" (${sourceMilestone.id}) description is already up to date. No changes made.`;
	}

	const updateResult = await core.filesystem.updateMilestoneDescription(sourceMilestone.id, args.description);
	if (!updateResult.success || !updateResult.milestone || !updateResult.filePath || !updateResult.originalContent) {
		throw new MilestoneMutationError(
			`Failed to update milestone description for "${sourceMilestone.title}".`,
			"INTERNAL_ERROR",
		);
	}

	try {
		await commitMilestoneMutation(core, `backlog: Edit milestone ${sourceMilestone.id}`, {
			taskFilePaths: [updateResult.filePath],
		});
	} catch {
		try {
			await Bun.write(updateResult.filePath, updateResult.originalContent);
		} catch {
			// Ignore rollback failures and surface the original finalization failure.
		}
		throw new MilestoneMutationError(
			`Failed while finalizing milestone edit "${sourceMilestone.title}".`,
			"INTERNAL_ERROR",
		);
	}

	return `Updated milestone "${updateResult.milestone.title}" (${updateResult.milestone.id}) description.`;
}

export async function bulkUpdateTaskMilestonesForProject(
	core: Core,
	args: { taskIds: string[]; milestone: string | null },
): Promise<string> {
	const requestedTaskIds = args.taskIds.map((taskId) => normalizeTaskId(String(taskId || "").trim())).filter(Boolean);
	if (requestedTaskIds.length === 0) {
		throw new MilestoneMutationError("At least one task ID is required.", "VALIDATION_ERROR");
	}

	const dedupedTaskIds = Array.from(new Set(requestedTaskIds));
	const tasks = await listLocalTasks(core);
	const matches: Task[] = [];
	const missingTaskIds: string[] = [];
	for (const requestedTaskId of dedupedTaskIds) {
		const matchedTask = tasks.find((task) => taskIdsEqual(requestedTaskId, task.id));
		if (!matchedTask) {
			missingTaskIds.push(requestedTaskId);
			continue;
		}
		if (!isLocalEditableTask(matchedTask)) {
			missingTaskIds.push(requestedTaskId);
			continue;
		}
		matches.push(matchedTask);
	}

	if (matches.length === 0) {
		throw new MilestoneMutationError(`No matching local tasks found for: ${missingTaskIds.join(", ")}`, "NOT_FOUND");
	}

	const targetMilestone = args.milestone?.trim().length ? args.milestone.trim() : null;
	const changedTaskIds: string[] = [];
	const unchangedTaskIds: string[] = [];
	const updatedTaskFilePaths = new Set<string>();
	const previousMilestones = new Map<string, string | undefined>();

	try {
		for (const task of matches) {
			const nextMilestone = targetMilestone ?? undefined;
			if ((task.milestone ?? undefined) === nextMilestone) {
				unchangedTaskIds.push(task.id);
				continue;
			}

			previousMilestones.set(task.id, task.milestone);
			const updatedTask = await core.editTask(task.id, { milestone: targetMilestone }, false);
			const taskFilePath = updatedTask.filePath ?? task.filePath;
			if (taskFilePath) {
				updatedTaskFilePaths.add(taskFilePath);
			}
			changedTaskIds.push(task.id);
		}
	} catch {
		const rollbackFailures = await rollbackTaskMilestones(core, previousMilestones);
		const detailSuffix = rollbackFailures.length > 0 ? ` (failed rollback for: ${rollbackFailures.join(", ")})` : "";
		throw new MilestoneMutationError(`Failed while updating task milestones${detailSuffix}.`, "INTERNAL_ERROR");
	}

	if (changedTaskIds.length > 0) {
		try {
			await commitMilestoneMutation(
				core,
				targetMilestone
					? `backlog: Set milestone for ${changedTaskIds.length} tasks`
					: `backlog: Clear milestone for ${changedTaskIds.length} tasks`,
				{
					taskFilePaths: updatedTaskFilePaths,
				},
			);
		} catch {
			const rollbackFailures = await rollbackTaskMilestones(core, previousMilestones);
			const detailSuffix = rollbackFailures.length > 0 ? ` (failed rollback for: ${rollbackFailures.join(", ")})` : "";
			throw new MilestoneMutationError(
				`Failed while finalizing bulk milestone update${detailSuffix}.`,
				"INTERNAL_ERROR",
			);
		}
	}

	const summaryLines: string[] = [];
	if (targetMilestone) {
		summaryLines.push(
			`Set milestone to ${targetMilestone} for ${changedTaskIds.length} local task${changedTaskIds.length === 1 ? "" : "s"}: ${formatTaskIdList(changedTaskIds.sort((a, b) => a.localeCompare(b)))}`,
		);
	} else {
		summaryLines.push(
			`Cleared milestone for ${changedTaskIds.length} local task${changedTaskIds.length === 1 ? "" : "s"}: ${formatTaskIdList(changedTaskIds.sort((a, b) => a.localeCompare(b)))}`,
		);
	}
	if (unchangedTaskIds.length > 0) {
		summaryLines.push(
			`Unchanged ${unchangedTaskIds.length} task${unchangedTaskIds.length === 1 ? "" : "s"} already matched the target state: ${formatTaskIdList(unchangedTaskIds.sort((a, b) => a.localeCompare(b)))}`,
		);
	}
	if (missingTaskIds.length > 0) {
		summaryLines.push(
			`Skipped ${missingTaskIds.length} unknown or non-local task ID${missingTaskIds.length === 1 ? "" : "s"}: ${formatTaskIdList(missingTaskIds.sort((a, b) => a.localeCompare(b)))}`,
		);
	}

	return summaryLines.join("\n");
}

export type MilestoneRemoveTaskHandling = "clear" | "keep" | "reassign";

export async function removeMilestoneForProject(
	core: Core,
	args: { name: string; taskHandling?: MilestoneRemoveTaskHandling; reassignTo?: string },
): Promise<string> {
	const name = normalizeMilestoneName(args.name);
	if (!name) {
		throw new MilestoneMutationError("Milestone name cannot be empty.", "VALIDATION_ERROR");
	}

	const fileMilestones = await core.filesystem.listMilestones();
	const archivedMilestones = await core.filesystem.listArchivedMilestones();
	const sourceMilestone = findActiveMilestoneByAlias(name, fileMilestones);
	if (!sourceMilestone) {
		throw new MilestoneMutationError(`Milestone not found: "${name}"`, "NOT_FOUND");
	}
	const hasTitleCollision = hasMilestoneTitleAliasCollision(sourceMilestone, [
		...fileMilestones,
		...archivedMilestones,
	]);
	const removeKeys = buildTaskMatchKeysForMilestone(name, sourceMilestone, !hasTitleCollision);
	const taskHandling = args.taskHandling ?? "clear";
	const reassignTo = normalizeMilestoneName(args.reassignTo ?? "");
	const targetMilestone =
		taskHandling === "reassign" ? findActiveMilestoneByAlias(reassignTo, fileMilestones) : undefined;
	const reassignedMilestone = targetMilestone?.id ?? "";

	if (taskHandling === "reassign") {
		if (!reassignTo) {
			throw new MilestoneMutationError("reassignTo is required when taskHandling is reassign.", "VALIDATION_ERROR");
		}
		if (!targetMilestone) {
			throw new MilestoneMutationError(`Target milestone not found: "${reassignTo}"`, "VALIDATION_ERROR");
		}
		if (milestoneKey(targetMilestone.id) === milestoneKey(sourceMilestone.id)) {
			throw new MilestoneMutationError("reassignTo must be different from the removed milestone.", "VALIDATION_ERROR");
		}
	}

	const tasks = taskHandling !== "keep" ? await listLocalTasks(core) : [];
	const matches =
		taskHandling !== "keep" ? tasks.filter((task) => removeKeys.has(milestoneKey(task.milestone ?? ""))) : [];
	const previousMilestones = new Map<string, string | undefined>();
	let updatedTaskIds: string[] = [];
	const updatedTaskFilePaths = new Set<string>();
	if (taskHandling !== "keep") {
		try {
			for (const task of matches) {
				previousMilestones.set(task.id, task.milestone);
				const updatedTask = await core.editTask(
					task.id,
					{ milestone: taskHandling === "reassign" ? reassignedMilestone : null },
					false,
				);
				const taskFilePath = updatedTask.filePath ?? task.filePath;
				if (taskFilePath) {
					updatedTaskFilePaths.add(taskFilePath);
				}
				updatedTaskIds.push(task.id);
			}
			updatedTaskIds = updatedTaskIds.sort((a, b) => a.localeCompare(b));
		} catch {
			const rollbackFailures = await rollbackTaskMilestones(core, previousMilestones);
			const detailSuffix = rollbackFailures.length > 0 ? ` (failed rollback for: ${rollbackFailures.join(", ")})` : "";
			throw new MilestoneMutationError(
				`Failed while updating tasks for milestone removal "${sourceMilestone.title}"${detailSuffix}.`,
				"INTERNAL_ERROR",
			);
		}
	}

	const archiveResult = await core.archiveMilestone(sourceMilestone.id, false);
	if (!archiveResult.success) {
		let detailSuffix = "";
		if (taskHandling !== "keep") {
			const rollbackFailures = await rollbackTaskMilestones(core, previousMilestones);
			if (rollbackFailures.length > 0) {
				detailSuffix = ` (failed rollback for: ${rollbackFailures.join(", ")})`;
			}
		}
		throw new MilestoneMutationError(
			`Failed to archive milestone "${sourceMilestone.title}" before removal.${detailSuffix}`,
			"INTERNAL_ERROR",
		);
	}
	try {
		await commitMilestoneMutation(core, `backlog: Remove milestone ${sourceMilestone.id}`, {
			sourcePath: archiveResult.sourcePath,
			targetPath: archiveResult.targetPath,
			taskFilePaths: updatedTaskFilePaths,
		});
	} catch {
		const rollbackDetails: string[] = [];
		if (archiveResult.sourcePath && archiveResult.targetPath) {
			try {
				await moveFile(archiveResult.targetPath, archiveResult.sourcePath);
			} catch {
				rollbackDetails.push("failed to rollback milestone archive");
			}
		}
		if (taskHandling !== "keep") {
			const rollbackFailures = await rollbackTaskMilestones(core, previousMilestones);
			if (rollbackFailures.length > 0) {
				rollbackDetails.push(`failed rollback for: ${rollbackFailures.join(", ")}`);
			}
		}
		const detailSuffix = rollbackDetails.length > 0 ? ` (${rollbackDetails.join("; ")})` : "";
		throw new MilestoneMutationError(
			`Failed while finalizing milestone removal "${sourceMilestone.title}"${detailSuffix}.`,
			"INTERNAL_ERROR",
		);
	}

	const summaryLines: string[] = [`Removed milestone "${sourceMilestone.title}" (${sourceMilestone.id}).`];
	if (taskHandling === "keep") {
		summaryLines.push("Kept task milestone values unchanged (taskHandling=keep).");
	} else if (taskHandling === "reassign") {
		const targetSummary = `"${targetMilestone?.title}" (${reassignedMilestone})`;
		summaryLines.push(
			`Reassigned ${updatedTaskIds.length} local task${updatedTaskIds.length === 1 ? "" : "s"} to ${targetSummary}: ${formatTaskIdList(updatedTaskIds)}`,
		);
	} else {
		summaryLines.push(
			`Cleared milestone for ${updatedTaskIds.length} local task${updatedTaskIds.length === 1 ? "" : "s"}: ${formatTaskIdList(updatedTaskIds)}`,
		);
	}
	return summaryLines.join("\n");
}

export function formatListBlock(title: string, items: string[]): string {
	if (items.length === 0) {
		return `${title}\n  (none)`;
	}
	return `${title}\n${items.map((item) => `  - ${item}`).join("\n")}`;
}

export function resolveMilestoneValueForReporting(
	value: string,
	activeMilestones: Milestone[],
	archivedMilestones: Milestone[],
): string {
	const normalized = normalizeMilestoneName(value);
	if (!normalized) {
		return "";
	}
	const inputKey = milestoneKey(normalized);
	const looksLikeMilestoneId = /^\d+$/.test(normalized) || /^m-\d+$/i.test(normalized);
	const canonicalInputId = looksLikeMilestoneId
		? `m-${String(Number.parseInt(normalized.replace(/^m-/i, ""), 10))}`
		: null;
	const aliasKeys = new Set<string>([inputKey]);
	if (canonicalInputId) {
		const numericAlias = canonicalInputId.replace(/^m-/, "");
		aliasKeys.add(canonicalInputId);
		aliasKeys.add(numericAlias);
	}

	const idMatchesAlias = (milestoneId: string): boolean => {
		const idKey = milestoneKey(milestoneId);
		if (aliasKeys.has(idKey)) {
			return true;
		}
		const idMatch = milestoneId.trim().match(/^m-(\d+)$/i);
		if (!idMatch?.[1]) {
			return false;
		}
		const numericAlias = String(Number.parseInt(idMatch[1], 10));
		return aliasKeys.has(`m-${numericAlias}`) || aliasKeys.has(numericAlias);
	};
	const findIdMatch = (milestones: Milestone[]): Milestone | undefined => {
		const rawExactMatch = milestones.find((milestone) => milestoneKey(milestone.id) === inputKey);
		if (rawExactMatch) {
			return rawExactMatch;
		}
		if (canonicalInputId) {
			const canonicalRawMatch = milestones.find((milestone) => milestoneKey(milestone.id) === canonicalInputId);
			if (canonicalRawMatch) {
				return canonicalRawMatch;
			}
		}
		return milestones.find((milestone) => idMatchesAlias(milestone.id));
	};
	const findUniqueTitleMatch = (milestones: Milestone[]): Milestone | undefined => {
		const titleMatches = milestones.filter((milestone) => milestoneKey(milestone.title) === inputKey);
		return titleMatches.length === 1 ? titleMatches[0] : undefined;
	};

	const activeTitleMatches = activeMilestones.filter((milestone) => milestoneKey(milestone.title) === inputKey);
	if (looksLikeMilestoneId) {
		const activeIdMatch = findIdMatch(activeMilestones);
		if (activeIdMatch) {
			return activeIdMatch.id;
		}
		const archivedIdMatch = findIdMatch(archivedMilestones);
		if (archivedIdMatch) {
			return archivedIdMatch.id;
		}
		if (activeTitleMatches.length === 1) {
			return activeTitleMatches[0]?.id ?? normalized;
		}
		if (activeTitleMatches.length > 1) {
			return normalized;
		}
		return findUniqueTitleMatch(archivedMilestones)?.id ?? normalized;
	}

	const activeTitleMatch = findUniqueTitleMatch(activeMilestones);
	if (activeTitleMatch) {
		return activeTitleMatch.id;
	}
	if (activeTitleMatches.length > 1) {
		return normalized;
	}
	const activeIdMatch = findIdMatch(activeMilestones);
	if (activeIdMatch) {
		return activeIdMatch.id;
	}
	const archivedTitleMatch = findUniqueTitleMatch(archivedMilestones);
	if (archivedTitleMatch) {
		return archivedTitleMatch.id;
	}
	return findIdMatch(archivedMilestones)?.id ?? normalized;
}

export async function buildMilestoneListReport(core: Core): Promise<string> {
	const fileMilestones = await core.filesystem.listMilestones();
	const archivedMilestones = await core.filesystem.listArchivedMilestones();
	const reservedIdKeys = new Set<string>();
	for (const milestone of [...fileMilestones, ...archivedMilestones]) {
		for (const key of buildMilestoneMatchKeys(milestone.id, [])) {
			reservedIdKeys.add(key);
		}
	}
	const activeTitleCounts = new Map<string, number>();
	for (const milestone of fileMilestones) {
		const titleKey = milestoneKey(milestone.title);
		if (!titleKey) continue;
		activeTitleCounts.set(titleKey, (activeTitleCounts.get(titleKey) ?? 0) + 1);
	}
	const fileMilestoneKeys = new Set<string>();
	for (const milestone of fileMilestones) {
		for (const key of buildMilestoneMatchKeys(milestone.id, [])) {
			fileMilestoneKeys.add(key);
		}
		const titleKey = milestoneKey(milestone.title);
		if (titleKey && !reservedIdKeys.has(titleKey) && activeTitleCounts.get(titleKey) === 1) {
			fileMilestoneKeys.add(titleKey);
		}
	}
	const archivedKeys = new Set<string>(collectArchivedMilestoneKeys(archivedMilestones, fileMilestones));

	const tasks = await listLocalTasks(core);
	const discoveredByKey = new Map<string, string>();
	for (const task of tasks) {
		const normalized = normalizeMilestoneName(task.milestone ?? "");
		if (!normalized) continue;
		const canonicalValue = resolveMilestoneValueForReporting(normalized, fileMilestones, archivedMilestones);
		const key = milestoneKey(canonicalValue);
		if (!discoveredByKey.has(key)) {
			discoveredByKey.set(key, canonicalValue);
		}
	}

	const unconfigured = Array.from(discoveredByKey.entries())
		.filter(([key]) => !fileMilestoneKeys.has(key) && !archivedKeys.has(key))
		.map(([, value]) => value)
		.sort((a, b) => a.localeCompare(b));
	const archivedTaskValues = Array.from(discoveredByKey.entries())
		.filter(([key]) => !fileMilestoneKeys.has(key) && archivedKeys.has(key))
		.map(([, value]) => value)
		.sort((a, b) => a.localeCompare(b));

	const blocks: string[] = [];
	const milestoneLines = fileMilestones.map((m) => `${m.id}: ${m.title}`);
	blocks.push(formatListBlock(`Milestones (${fileMilestones.length}):`, milestoneLines));
	blocks.push(formatListBlock(`Milestones found on tasks without files (${unconfigured.length}):`, unconfigured));
	blocks.push(
		formatListBlock(`Archived milestone values still on tasks (${archivedTaskValues.length}):`, archivedTaskValues),
	);
	blocks.push(
		"Hint: use `backlog milestone add`, `backlog milestone rename`, `backlog milestone remove`, and `backlog milestone archive` to manage milestone files.",
	);

	return blocks.join("\n\n");
}
