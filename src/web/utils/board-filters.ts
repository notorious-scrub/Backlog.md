import type { Task } from "../../types";

export function normalizeBoardSearchQuery(query: string): string {
	return query.trim().toLowerCase();
}

function collectTaskSearchValues(task: Task): string[] {
	return [
		task.id,
		task.title,
		task.status,
		task.description,
		task.implementationPlan,
		task.implementationNotes,
		task.finalSummary,
		task.milestone,
		...(task.labels ?? []),
		...(task.assignee ?? []),
		...(task.dependencies ?? []),
		...(task.references ?? []),
	].filter((value): value is string => typeof value === "string" && value.trim().length > 0);
}

export function taskMatchesBoardSearch(task: Task, query: string): boolean {
	const normalizedQuery = normalizeBoardSearchQuery(query);
	if (!normalizedQuery) {
		return true;
	}

	return collectTaskSearchValues(task).some((value) => value.toLowerCase().includes(normalizedQuery));
}

export function filterBoardTasks(
	tasks: Task[],
	options: {
		query?: string;
		hiddenStatuses?: string[];
	},
): Task[] {
	const normalizedQuery = normalizeBoardSearchQuery(options.query ?? "");
	const hiddenStatuses = new Set((options.hiddenStatuses ?? []).map((status) => status.trim().toLowerCase()));

	return tasks.filter((task) => {
		if (hiddenStatuses.has(task.status.trim().toLowerCase())) {
			return false;
		}
		if (!normalizedQuery) {
			return true;
		}
		return taskMatchesBoardSearch(task, normalizedQuery);
	});
}

export function getVisibleBoardStatuses(statuses: string[], hiddenStatuses: string[]): string[] {
	const hidden = new Set(hiddenStatuses.map((status) => status.trim().toLowerCase()));
	return statuses.filter((status) => !hidden.has(status.trim().toLowerCase()));
}
