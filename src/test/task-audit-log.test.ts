import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { Core } from "../core/backlog.ts";
import type { TaskAuditEventPage } from "../types/index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
let core: Core;

describe("task audit log", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("task-audit-log");
		core = new Core(TEST_DIR);
		await core.filesystem.ensureBacklogStructure();
		await core.filesystem.saveConfig({
			projectName: "Audit Log",
			statuses: ["To Do", "In Progress", "Done"],
			labels: ["audit"],
			dateFormat: "yyyy-mm-dd",
		});
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("persists task status and field-change audit events and supports newest-first cursor reads", async () => {
		const { task } = await core.createTaskFromInput({
			title: "Audit me",
			status: "To Do",
		});

		await core.updateTaskFromInput(task.id, {
			status: "In Progress",
			assignee: ["@Codex"],
			addLabels: ["audit"],
			priority: "high",
			milestone: "m-1",
		});

		const page = await core.filesystem.listTaskAuditEvents({ taskId: task.id, limit: 20 });
		const eventTypes = page.events.map((event) => event.eventType);
		expect(eventTypes).toContain("task_status_changed");
		expect(eventTypes).toContain("task_assignee_changed");
		expect(eventTypes).toContain("task_labels_changed");
		expect(eventTypes).toContain("task_priority_changed");
		expect(eventTypes).toContain("task_milestone_changed");

		const statusEvent = page.events.find((event) => event.eventType === "task_status_changed");
		expect(statusEvent?.actor.kind).toBe("user");
		expect(statusEvent?.actor.source).toBe("cli");
		expect(statusEvent?.summary).toContain("To Do");
		expect(statusEvent?.summary).toContain("In Progress");
		expect(statusEvent?.data).toMatchObject({
			previousStatus: "To Do",
			nextStatus: "In Progress",
			previousAssignees: [],
			nextAssignees: ["@Codex"],
		});

		const firstPage = await core.filesystem.listTaskAuditEvents({ taskId: task.id, limit: 1 });
		expect(firstPage.events).toHaveLength(1);
		expect(firstPage.nextCursor).toBe(firstPage.events[0]?.id);

		const secondPage: TaskAuditEventPage = await core.filesystem.listTaskAuditEvents({
			taskId: task.id,
			limit: 1,
			cursor: firstPage.nextCursor,
		});
		expect(secondPage.events).toHaveLength(1);
		expect(secondPage.events[0]?.id).not.toBe(firstPage.events[0]?.id);
	});
});
