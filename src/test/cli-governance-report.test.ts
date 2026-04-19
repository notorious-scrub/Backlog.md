import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../index.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
const CLI_PATH = join(process.cwd(), "src", "cli.ts");

describe("CLI governance reporting", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-cli-governance");
		await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
		await mkdir(TEST_DIR, { recursive: true });

		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

		const core = new Core(TEST_DIR);
		await core.initializeProject("Governance CLI Project");
		const milestone = await core.createMilestone("Wave 1", "Governance slice");
		const config = await core.filesystem.loadConfig();
		if (!config) {
			throw new Error("Expected config");
		}
		await core.filesystem.saveConfig({
			...config,
			labels: ["docs", "platform"],
		});

		await core.filesystem.saveTask({
			id: "task-1",
			title: "Missing docs task",
			status: "In Progress",
			assignee: ["@codex"],
			createdDate: "2026-04-18 10:00",
			labels: ["docs"],
			dependencies: [],
			milestone: milestone.id,
			description: "Needs docs and summary parent",
		} as Task);

		await core.filesystem.saveTask({
			id: "task-2",
			title: "Invalid metadata task",
			status: "To Do",
			assignee: ["@codex"],
			createdDate: "2026-04-18 10:05",
			labels: ["rogue"],
			dependencies: ["task-999"],
			milestone: "m-999",
			description: "Broken references",
			documentation: ["docs/spec.md"],
		} as Task);

		await core.filesystem.saveTask({
			id: "task-3",
			title: "Healthy child",
			status: "In Progress",
			assignee: ["@codex"],
			createdDate: "2026-04-18 10:10",
			labels: ["platform"],
			dependencies: [],
			milestone: milestone.id,
			summaryParentTaskId: "task-1",
			description: "Healthy task",
			documentation: ["docs/spec.md"],
		} as Task);
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("filters task list by missing governance fields", async () => {
		const result = await $`bun ${CLI_PATH} task list --missing-field documentation --plain`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain("TASK-1 - Missing docs task");
		expect(result.stdout.toString()).not.toContain("TASK-3 - Healthy child");
	});

	it("filters task list by missing summary parent", async () => {
		const result = await $`bun ${CLI_PATH} task list --missing-summary-parent --plain`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain("TASK-1 - Missing docs task");
		expect(result.stdout.toString()).not.toContain("TASK-3 - Healthy child");
	});

	it("returns invalid metadata task filters in JSON output", async () => {
		const result =
			await $`bun ${CLI_PATH} task list --invalid-labels --invalid-dependencies --invalid-milestones --json`
				.cwd(TEST_DIR)
				.quiet();

		expect(result.exitCode).toBe(0);
		const payload = JSON.parse(result.stdout.toString()) as {
			total: number;
			filters: Record<string, unknown>;
			tasks: Array<{ id: string }>;
		};

		expect(payload.total).toBe(1);
		expect(payload.filters.invalidLabels).toBe(true);
		expect(payload.filters.invalidDependencies).toBe(true);
		expect(payload.filters.invalidMilestones).toBe(true);
		expect(payload.tasks.map((task) => task.id)).toEqual(["TASK-2"]);
	});

	it("returns repeatable governance reports as JSON", async () => {
		const result = await $`bun ${CLI_PATH} report governance missing-documentation --json`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		const payload = JSON.parse(result.stdout.toString()) as {
			command: string;
			report: {
				id: string;
				taskCount: number;
				findings: Array<{ taskId: string }>;
			};
		};

		expect(payload.command).toBe("report.governance");
		expect(payload.report.id).toBe("missing-documentation");
		expect(payload.report.taskCount).toBe(1);
		expect(payload.report.findings.map((finding) => finding.taskId)).toEqual(["TASK-1"]);
	});
});
