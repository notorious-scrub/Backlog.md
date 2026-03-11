import { describe, expect, it } from "bun:test";
import type { Task } from "../../types";
import { filterBoardTasks, getVisibleBoardStatuses, taskMatchesBoardSearch } from "./board-filters";

const sampleTask: Task = {
	id: "TASK-12",
	title: "Fix kanban status order",
	status: "In Progress",
	assignee: ["@sean"],
	createdDate: "2026-03-06",
	labels: ["kanban", "ux"],
	dependencies: [],
	description: "Ensure Done can remain the far-right column.",
};

describe("board-filters", () => {
	it("matches board search across task fields", () => {
		expect(taskMatchesBoardSearch(sampleTask, "status order")).toBe(true);
		expect(taskMatchesBoardSearch(sampleTask, "@sean")).toBe(true);
		expect(taskMatchesBoardSearch(sampleTask, "TASK-12")).toBe(true);
		expect(taskMatchesBoardSearch(sampleTask, "missing")).toBe(false);
	});

	it("filters tasks by query and hidden statuses", () => {
		const doneTask: Task = {
			...sampleTask,
			id: "TASK-13",
			title: "Archive completed cards",
			status: "Done",
		};

		const filtered = filterBoardTasks([sampleTask, doneTask], {
			query: "kanban",
			hiddenStatuses: ["done"],
		});

		expect(filtered.map((task) => task.id)).toEqual(["TASK-12"]);
	});

	it("returns visible statuses in their original order", () => {
		expect(getVisibleBoardStatuses(["To Do", "Blocked", "Done"], ["done"])).toEqual(["To Do", "Blocked"]);
	});
});
