import type { Core } from "../index.ts";
import type { BacklogConfig, Task, ValidationTaskField } from "../types/index.ts";
import { normalizeTaskId } from "../utils/task-path.ts";

export type ValidationRuleId = "missing_required_field" | "invalid_dependency" | "invalid_label" | "invalid_milestone";

export interface ValidationIssue {
	rule: ValidationRuleId;
	level: "error";
	taskId: string;
	taskTitle: string;
	message: string;
	field?: ValidationTaskField;
	value?: string;
}

export interface ValidationReport {
	valid: boolean;
	taskCount: number;
	issueCount: number;
	requiredTaskFields: ValidationTaskField[];
	issueCounts: Record<ValidationRuleId, number>;
	issues: ValidationIssue[];
}

const SUPPORTED_REQUIRED_FIELDS: ValidationTaskField[] = [
	"description",
	"documentation",
	"assignee",
	"labels",
	"milestone",
	"priority",
	"implementationPlan",
	"implementationNotes",
	"finalSummary",
	"acceptanceCriteria",
	"definitionOfDone",
];

function isRequiredTaskField(value: string): value is ValidationTaskField {
	return SUPPORTED_REQUIRED_FIELDS.includes(value as ValidationTaskField);
}

function isTaskFieldPresent(task: Task, field: ValidationTaskField): boolean {
	switch (field) {
		case "description":
			return Boolean(task.description?.trim());
		case "documentation":
			return Boolean(task.documentation && task.documentation.length > 0);
		case "assignee":
			return Boolean(task.assignee && task.assignee.length > 0);
		case "labels":
			return Boolean(task.labels && task.labels.length > 0);
		case "milestone":
			return Boolean(task.milestone?.trim());
		case "priority":
			return Boolean(task.priority);
		case "implementationPlan":
			return Boolean(task.implementationPlan?.trim());
		case "implementationNotes":
			return Boolean(task.implementationNotes?.trim());
		case "finalSummary":
			return Boolean(task.finalSummary?.trim());
		case "acceptanceCriteria":
			return Boolean(task.acceptanceCriteriaItems && task.acceptanceCriteriaItems.length > 0);
		case "definitionOfDone":
			return Boolean(task.definitionOfDoneItems && task.definitionOfDoneItems.length > 0);
	}
}

function getRequiredTaskFields(config: BacklogConfig | null): ValidationTaskField[] {
	const configured = config?.validation?.requiredTaskFields ?? [];
	return configured.filter(isRequiredTaskField);
}

export async function validateBacklogProject(core: Core): Promise<ValidationReport> {
	await core.ensureConfigLoaded();

	const [tasks, drafts, config, milestones, archivedMilestones] = await Promise.all([
		core.queryTasks({ includeCrossBranch: false }),
		core.filesystem.listDrafts(),
		core.filesystem.loadConfig(),
		core.filesystem.listMilestones(),
		core.filesystem.listArchivedMilestones(),
	]);

	const requiredTaskFields = getRequiredTaskFields(config);
	const configuredLabels = new Set((config?.labels ?? []).map((label) => label.trim().toLowerCase()).filter(Boolean));
	const knownTaskIds = new Set(
		[...tasks, ...drafts].map((task) => {
			try {
				return normalizeTaskId(task.id);
			} catch {
				return task.id.trim().toUpperCase();
			}
		}),
	);
	const knownMilestoneIds = new Set(
		[...milestones, ...archivedMilestones].map((milestone) => milestone.id.trim()).filter(Boolean),
	);
	const issues: ValidationIssue[] = [];

	for (const task of tasks) {
		for (const field of requiredTaskFields) {
			if (!isTaskFieldPresent(task, field)) {
				issues.push({
					rule: "missing_required_field",
					level: "error",
					taskId: task.id,
					taskTitle: task.title,
					field,
					message: `Missing required field: ${field}`,
				});
			}
		}

		for (const dependency of task.dependencies ?? []) {
			const trimmedDependency = dependency.trim();
			if (!trimmedDependency) {
				continue;
			}
			const normalizedDependency = normalizeTaskId(trimmedDependency);
			if (!knownTaskIds.has(normalizedDependency)) {
				issues.push({
					rule: "invalid_dependency",
					level: "error",
					taskId: task.id,
					taskTitle: task.title,
					value: trimmedDependency,
					message: `Dependency ${trimmedDependency} does not resolve to a local task or draft.`,
				});
			}
		}

		if (configuredLabels.size > 0) {
			for (const label of task.labels ?? []) {
				const trimmedLabel = label.trim();
				if (!trimmedLabel) {
					continue;
				}
				if (!configuredLabels.has(trimmedLabel.toLowerCase())) {
					issues.push({
						rule: "invalid_label",
						level: "error",
						taskId: task.id,
						taskTitle: task.title,
						value: trimmedLabel,
						message: `Label ${trimmedLabel} is not declared in config.labels.`,
					});
				}
			}
		}

		if (task.milestone) {
			const milestone = task.milestone.trim();
			if (milestone.length > 0 && !knownMilestoneIds.has(milestone)) {
				issues.push({
					rule: "invalid_milestone",
					level: "error",
					taskId: task.id,
					taskTitle: task.title,
					value: milestone,
					message: `Milestone ${milestone} does not exist in backlog/milestones or backlog/archive/milestones.`,
				});
			}
		}
	}

	const issueCounts: ValidationReport["issueCounts"] = {
		missing_required_field: 0,
		invalid_dependency: 0,
		invalid_label: 0,
		invalid_milestone: 0,
	};

	for (const issue of issues) {
		issueCounts[issue.rule] += 1;
	}

	return {
		valid: issues.length === 0,
		taskCount: tasks.length,
		issueCount: issues.length,
		requiredTaskFields,
		issueCounts,
		issues,
	};
}
