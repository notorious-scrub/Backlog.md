import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

const TASK_KEYS = [
	"acceptanceCriteria",
	"assignee",
	"branch",
	"createdDate",
	"definitionOfDone",
	"dependencies",
	"description",
	"documentation",
	"finalSummary",
	"id",
	"implementationNotes",
	"implementationPlan",
	"labels",
	"milestone",
	"ordinal",
	"parentTaskId",
	"parentTaskTitle",
	"path",
	"priority",
	"references",
	"reporter",
	"summaryChildSummaries",
	"summaryChildren",
	"summaryParentTaskId",
	"summaryParentTaskTitle",
	"source",
	"status",
	"subtaskSummaries",
	"subtasks",
	"title",
	"updatedDate",
].sort();

const cliPath = join(process.cwd(), "src", "cli.ts");

function parseJson(stdout: string): unknown {
	return JSON.parse(stdout);
}

describe("CLI --json output", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-cli-json-output");
		try {
			await rm(TEST_DIR, { recursive: true, force: true });
		} catch {}
		await mkdir(TEST_DIR, { recursive: true });

		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

		const core = new Core(TEST_DIR);
		await core.initializeProject("CLI JSON Project");
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("returns a stable machine-readable contract for task create", async () => {
		const result = await $`bun ${cliPath} task create "JSON Create" --desc "Hello" --json`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		const payload = parseJson(result.stdout.toString()) as {
			ok: boolean;
			command: string;
			entity: string;
			path: string | null;
			task: Record<string, unknown>;
		};

		expect(Object.keys(payload).sort()).toEqual(["command", "entity", "ok", "path", "task"]);
		expect(payload.ok).toBe(true);
		expect(payload.command).toBe("task.create");
		expect(payload.entity).toBe("task");
		expect(typeof payload.path).toBe("string");
		expect(Object.keys(payload.task).sort()).toEqual(TASK_KEYS);
		expect(payload.task.id).toBe("TASK-1");
		expect(payload.task.title).toBe("JSON Create");
		expect(payload.task.description).toBe("Hello");
		expect(payload.task.path).toBe(payload.path);
	});

	it("returns change metadata and the same task field set for task edit", async () => {
		await $`bun ${cliPath} task create "JSON Edit" --desc "Before"`.cwd(TEST_DIR).quiet();

		const result = await $`bun ${cliPath} task edit 1 -s "In Progress" --json`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		const payload = parseJson(result.stdout.toString()) as {
			ok: boolean;
			command: string;
			changed: boolean;
			path: string | null;
			task: Record<string, unknown>;
		};

		expect(Object.keys(payload).sort()).toEqual(["changed", "command", "ok", "path", "task"]);
		expect(payload.ok).toBe(true);
		expect(payload.command).toBe("task.edit");
		expect(payload.changed).toBe(true);
		expect(typeof payload.path).toBe("string");
		expect(Object.keys(payload.task).sort()).toEqual(TASK_KEYS);
		expect(payload.task.status).toBe("In Progress");
		expect(typeof payload.task.updatedDate).toBe("string");
		expect(payload.task.path).toBe(payload.path);
	});

	it("returns structured task details for task view", async () => {
		await $`bun ${cliPath} task create "JSON View" --desc "Inspect me"`.cwd(TEST_DIR).quiet();

		const result = await $`bun ${cliPath} task view 1 --json`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		const payload = parseJson(result.stdout.toString()) as {
			ok: boolean;
			command: string;
			path: string | null;
			task: Record<string, unknown>;
		};

		expect(Object.keys(payload).sort()).toEqual(["command", "ok", "path", "task"]);
		expect(payload.ok).toBe(true);
		expect(payload.command).toBe("task.view");
		expect(Object.keys(payload.task).sort()).toEqual(TASK_KEYS);
		expect(payload.task.id).toBe("TASK-1");
		expect(payload.task.title).toBe("JSON View");
	});

	it("returns grouped and flat task list data", async () => {
		await $`bun ${cliPath} task create "List One" --status "To Do"`.cwd(TEST_DIR).quiet();
		await $`bun ${cliPath} task create "List Two" --status "In Progress"`.cwd(TEST_DIR).quiet();

		const result = await $`bun ${cliPath} task list --json`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		const payload = parseJson(result.stdout.toString()) as {
			ok: boolean;
			command: string;
			filters: Record<string, unknown>;
			sort: string;
			total: number;
			groups: Array<{ status: string; count: number; tasks: Array<Record<string, unknown>> }>;
			tasks: Array<Record<string, unknown>>;
		};

		expect(Object.keys(payload).sort()).toEqual(["command", "filters", "groups", "ok", "sort", "tasks", "total"]);
		expect(payload.ok).toBe(true);
		expect(payload.command).toBe("task.list");
		expect(payload.total).toBe(2);
		expect(payload.sort).toBe("priority");
		expect(payload.tasks).toHaveLength(2);
		expect(Object.keys(payload.tasks[0] ?? {}).sort()).toEqual(TASK_KEYS);
		expect(payload.groups.map((group) => group.status)).toEqual(["To Do", "In Progress"]);
		expect(payload.groups.map((group) => group.count)).toEqual([1, 1]);
	});

	it("returns typed search results with stable counts and entity shapes", async () => {
		const core = new Core(TEST_DIR);
		await core.createTask(
			{
				id: "task-1",
				title: "Central search integration",
				status: "To Do",
				assignee: ["@codex"],
				createdDate: "2025-09-18",
				labels: ["search"],
				dependencies: [],
				rawContent: "Implements central search module",
				description: "Implements central search module",
			},
			false,
		);
		await core.filesystem.saveDocument({
			id: "doc-1",
			title: "Search Architecture Notes",
			type: "guide",
			createdDate: "2025-09-18",
			rawContent: "# Search Architecture Notes\nCentral search design",
		});
		await core.filesystem.saveDecision({
			id: "decision-1",
			title: "Adopt centralized search",
			date: "2025-09-18",
			status: "accepted",
			context: "Discussed search consolidation",
			decision: "Adopt shared Fuse index",
			consequences: "Unified search paths",
			rawContent: "## Context\nDiscussed search consolidation\n\n## Decision\nAdopt shared Fuse index",
		});

		const result = await $`bun ${cliPath} search central --json`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		const payload = parseJson(result.stdout.toString()) as {
			ok: boolean;
			command: string;
			query: string;
			filters: Record<string, unknown>;
			limit: number | null;
			total: number;
			counts: { tasks: number; documents: number; decisions: number };
			results: Array<Record<string, unknown>>;
		};

		expect(Object.keys(payload).sort()).toEqual([
			"command",
			"counts",
			"filters",
			"limit",
			"ok",
			"query",
			"results",
			"total",
		]);
		expect(payload.ok).toBe(true);
		expect(payload.command).toBe("search");
		expect(payload.query).toBe("central");
		expect(payload.counts).toEqual({ tasks: 1, documents: 1, decisions: 1 });
		expect(payload.total).toBe(3);
		expect(payload.results.map((result) => result.type).sort()).toEqual(["decision", "document", "task"]);
		const taskResult = payload.results.find((result) => result.type === "task");
		const documentResult = payload.results.find((result) => result.type === "document");
		const decisionResult = payload.results.find((result) => result.type === "decision");
		expect(Object.keys((taskResult?.task as Record<string, unknown>) ?? {}).sort()).toEqual(TASK_KEYS);
		expect(Object.keys((documentResult?.document as Record<string, unknown>) ?? {}).sort()).toEqual([
			"createdDate",
			"id",
			"isLegacy",
			"lastModified",
			"name",
			"path",
			"tags",
			"title",
			"type",
			"updatedDate",
		]);
		expect(Object.keys((decisionResult?.decision as Record<string, unknown>) ?? {}).sort()).toEqual([
			"alternatives",
			"consequences",
			"context",
			"date",
			"decision",
			"id",
			"status",
			"title",
		]);
	});
});
