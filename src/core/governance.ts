import type { Core } from "../index.ts";
import type {
	GovernanceReport,
	GovernanceReportFinding,
	GovernanceReportId,
	Task,
	ValidationTaskField,
} from "../types/index.ts";
import { validateBacklogProject } from "./validation.ts";

const ACTIVE_STATUS_NAMES = new Set(["done", "draft"]);

const GOVERNANCE_REPORT_META: Record<
	GovernanceReportId,
	{
		title: string;
		description: string;
	}
> = {
	"missing-documentation": {
		title: "Tasks Missing Documentation",
		description: "Tasks without documentation references.",
	},
	"invalid-labels": {
		title: "Tasks With Invalid Labels",
		description: "Tasks that use labels not declared in backlog config.",
	},
	"invalid-dependencies": {
		title: "Tasks With Invalid Dependencies",
		description: "Tasks that reference dependencies that do not resolve locally.",
	},
	"invalid-milestones": {
		title: "Tasks With Invalid Milestones",
		description: "Tasks that point at missing or malformed milestone references.",
	},
	"missing-summary-parent": {
		title: "Milestone Tasks Missing Summary Parent",
		description: "Active milestone tasks that do not belong to a modeled summary parent.",
	},
};

function isInactiveStatus(task: Task): boolean {
	return ACTIVE_STATUS_NAMES.has(task.status.trim().toLowerCase());
}

function buildFinding(task: Task, summary: string, details: string[] = []): GovernanceReportFinding {
	return {
		taskId: task.id,
		taskTitle: task.title,
		summary,
		details,
		task,
	};
}

export async function listGovernanceReportIds(): Promise<GovernanceReportId[]> {
	return Object.keys(GOVERNANCE_REPORT_META) as GovernanceReportId[];
}

export function isGovernanceReportId(value: string): value is GovernanceReportId {
	return value in GOVERNANCE_REPORT_META;
}

export async function buildGovernanceReport(core: Core, reportId: GovernanceReportId): Promise<GovernanceReport> {
	const tasks = await core.queryTasks({ includeCrossBranch: false });
	let findings: GovernanceReportFinding[] = [];

	if (reportId === "missing-documentation") {
		findings = tasks
			.filter((task) => !isInactiveStatus(task))
			.filter((task) => !(task.documentation && task.documentation.length > 0))
			.map((task) => buildFinding(task, "Missing documentation references."));
	} else if (reportId === "missing-summary-parent") {
		findings = tasks
			.filter((task) => !isInactiveStatus(task))
			.filter((task) => Boolean(task.milestone?.trim()))
			.filter((task) => !task.summaryParentTaskId)
			.map((task) =>
				buildFinding(task, "Missing summary parent for milestone-scoped work.", [
					`Milestone: ${task.milestone ?? "(none)"}`,
				]),
			);
	} else {
		const validationReport = await validateBacklogProject(core);
		const taskMap = new Map(tasks.map((task) => [task.id, task]));
		const matchingRules =
			reportId === "invalid-labels"
				? new Set(["invalid_label"])
				: reportId === "invalid-dependencies"
					? new Set(["invalid_dependency"])
					: new Set(["invalid_milestone"]);

		const findingsByTask = new Map<string, GovernanceReportFinding>();
		for (const issue of validationReport.issues) {
			if (!matchingRules.has(issue.rule)) {
				continue;
			}
			const task = taskMap.get(issue.taskId);
			if (!task) {
				continue;
			}
			const existing = findingsByTask.get(task.id);
			if (existing) {
				existing.details.push(issue.message);
				continue;
			}
			findingsByTask.set(task.id, buildFinding(task, issue.message, [issue.message]));
		}

		findings = Array.from(findingsByTask.values());
	}

	findings.sort((left, right) =>
		left.taskId.localeCompare(right.taskId, undefined, { numeric: true, sensitivity: "base" }),
	);

	const meta = GOVERNANCE_REPORT_META[reportId];
	return {
		id: reportId,
		title: meta.title,
		description: meta.description,
		taskCount: findings.length,
		generatedAt: new Date().toISOString(),
		findings,
	};
}

export function taskMatchesMissingField(task: Task, field: ValidationTaskField): boolean {
	switch (field) {
		case "description":
			return !task.description?.trim();
		case "documentation":
			return !(task.documentation && task.documentation.length > 0);
		case "assignee":
			return !(task.assignee && task.assignee.length > 0);
		case "labels":
			return !(task.labels && task.labels.length > 0);
		case "milestone":
			return !task.milestone?.trim();
		case "priority":
			return !task.priority;
		case "implementationPlan":
			return !task.implementationPlan?.trim();
		case "implementationNotes":
			return !task.implementationNotes?.trim();
		case "finalSummary":
			return !task.finalSummary?.trim();
		case "acceptanceCriteria":
			return !(task.acceptanceCriteriaItems && task.acceptanceCriteriaItems.length > 0);
		case "definitionOfDone":
			return !(task.definitionOfDoneItems && task.definitionOfDoneItems.length > 0);
	}
}
