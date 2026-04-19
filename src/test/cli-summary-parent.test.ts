import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

describe("CLI summary parent relationships", () => {
	const cliPath = join(process.cwd(), "src", "cli.ts");

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-summary-parent");
		try {
			await rm(TEST_DIR, { recursive: true, force: true });
		} catch {}
		await mkdir(TEST_DIR, { recursive: true });

		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

		const core = new Core(TEST_DIR);
		await core.initializeProject("Summary Parent CLI Project");

		await core.createTask(
			{
				id: "task-1",
				title: "Summary parent",
				status: "To Do",
				assignee: [],
				createdDate: "2026-04-18",
				labels: [],
				dependencies: [],
				description: "Parent task description",
			},
			false,
		);

		await core.createTaskFromInput(
			{
				title: "Summary child",
				summaryParentTaskId: "task-1",
			},
			false,
		);

		await core.createTaskFromInput(
			{
				title: "Dotted subtask",
				parentTaskId: "task-1",
			},
			false,
		);
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("filters tasks by summary parent separately from dotted subtasks", async () => {
		const result = await $`bun ${cliPath} task list --summary-parent task-1 --plain`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		const output = result.stdout.toString();
		expect(output).toContain("TASK-2 - Summary child");
		expect(output).not.toContain("TASK-1 - Summary parent");
		expect(output).not.toContain("TASK-1.1 - Dotted subtask");
	});

	it("shows summary hierarchy in task view json output", async () => {
		const result = await $`bun ${cliPath} task view 1 --json`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		const payload = JSON.parse(result.stdout.toString()) as {
			task: {
				summaryChildren: string[];
				summaryChildSummaries: Array<{ id: string; title: string }>;
				subtasks: string[];
			};
		};

		expect(payload.task.summaryChildren).toEqual(["TASK-2"]);
		expect(payload.task.summaryChildSummaries).toEqual([{ id: "TASK-2", title: "Summary child" }]);
		expect(payload.task.subtasks).toEqual(["TASK-1.1"]);
	});

	it("supports create and clear flows for summary parents", async () => {
		const createResult = await $`bun ${cliPath} task create "CLI summary child" --summary-parent task-1 --json`
			.cwd(TEST_DIR)
			.quiet();

		expect(createResult.exitCode).toBe(0);
		const createPayload = JSON.parse(createResult.stdout.toString()) as {
			task: { id: string; summaryParentTaskId: string | null };
		};
		expect(createPayload.task.id).toBe("TASK-3");
		expect(createPayload.task.summaryParentTaskId).toBe("TASK-1");

		const clearResult = await $`bun ${cliPath} task edit 3 --clear-summary-parent --json`.cwd(TEST_DIR).quiet();

		expect(clearResult.exitCode).toBe(0);
		const clearPayload = JSON.parse(clearResult.stdout.toString()) as {
			task: { summaryParentTaskId: string | null };
		};
		expect(clearPayload.task.summaryParentTaskId).toBeNull();
	});
});
