import type { Task } from "../types/index.ts";
import { taskIdsEqual } from "./task-path.ts";
import { sortByTaskId } from "./task-sorting.ts";

export function attachSubtaskSummaries(task: Task, tasks: Task[]): Task {
	let parentTitle: string | undefined;
	if (task.parentTaskId) {
		const parent = tasks.find((candidate) => taskIdsEqual(task.parentTaskId ?? "", candidate.id));
		if (parent) {
			parentTitle = parent.title;
		}
	}

	let summaryParentTitle: string | undefined;
	if (task.summaryParentTaskId) {
		const summaryParent = tasks.find((candidate) => taskIdsEqual(task.summaryParentTaskId ?? "", candidate.id));
		if (summaryParent) {
			summaryParentTitle = summaryParent.title;
		}
	}

	const summaries: Array<{ id: string; title: string }> = [];
	for (const candidate of tasks) {
		if (!candidate.parentTaskId) continue;
		if (!taskIdsEqual(candidate.parentTaskId, task.id)) continue;
		summaries.push({ id: candidate.id, title: candidate.title });
	}

	const summaryChildren: Array<{ id: string; title: string }> = [];
	for (const candidate of tasks) {
		if (!candidate.summaryParentTaskId) continue;
		if (!taskIdsEqual(candidate.summaryParentTaskId, task.id)) continue;
		summaryChildren.push({ id: candidate.id, title: candidate.title });
	}

	const sortedSummaries = summaries.length > 0 ? sortByTaskId(summaries) : undefined;
	const sortedSummaryChildren = summaryChildren.length > 0 ? sortByTaskId(summaryChildren) : undefined;

	const nextTask: Task = {
		...task,
		...(parentTitle && parentTitle !== task.parentTaskTitle ? { parentTaskTitle: parentTitle } : {}),
		...(summaryParentTitle && summaryParentTitle !== task.summaryParentTaskTitle
			? { summaryParentTaskTitle: summaryParentTitle }
			: {}),
	};

	if (sortedSummaries) {
		nextTask.subtasks = sortedSummaries.map((summary) => summary.id);
		nextTask.subtaskSummaries = sortedSummaries;
	}

	if (sortedSummaryChildren) {
		nextTask.summaryChildren = sortedSummaryChildren.map((summary) => summary.id);
		nextTask.summaryChildSummaries = sortedSummaryChildren;
	}

	if (
		nextTask.parentTaskTitle === task.parentTaskTitle &&
		nextTask.summaryParentTaskTitle === task.summaryParentTaskTitle &&
		nextTask.subtasks === task.subtasks &&
		nextTask.subtaskSummaries === task.subtaskSummaries &&
		nextTask.summaryChildren === task.summaryChildren &&
		nextTask.summaryChildSummaries === task.summaryChildSummaries
	) {
		return task;
	}

	return nextTask;
}
