import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../index.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;

const cliPath = join(process.cwd(), "src", "cli.ts");

describe("CLI validate command", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("test-cli-validate");
		try {
			await rm(TEST_DIR, { recursive: true, force: true });
		} catch {}
		await mkdir(TEST_DIR, { recursive: true });

		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("reports built-in and configured validation issues in human-readable output", async () => {
		const core = new Core(TEST_DIR);
		await core.initializeProject("Validate Project");
		const config = await core.filesystem.loadConfig();
		if (!config) {
			throw new Error("Expected config to exist");
		}
		await core.filesystem.saveConfig({
			...config,
			labels: ["docs"],
			validation: {
				requiredTaskFields: ["description", "documentation", "assignee"],
			},
		});

		await core.filesystem.saveTask({
			id: "task-1",
			title: "Invalid Task",
			status: "To Do",
			assignee: [],
			createdDate: "2026-04-18 10:00",
			labels: ["rogue"],
			dependencies: ["task-999"],
			milestone: "m-999",
			rawContent: "",
		} as Task);

		const result = await $`bun ${cliPath} validate`.cwd(TEST_DIR).quiet().nothrow();

		expect(result.exitCode).toBe(1);
		const stdout = result.stdout.toString();
		expect(stdout).toContain("Validation failed with 6 issues");
		expect(stdout).toContain("TASK-1 [missing_required_field] Missing required field: description");
		expect(stdout).toContain("TASK-1 [missing_required_field] Missing required field: documentation");
		expect(stdout).toContain("TASK-1 [missing_required_field] Missing required field: assignee");
		expect(stdout).toContain("TASK-1 [invalid_dependency] Dependency task-999 does not resolve");
		expect(stdout).toContain("TASK-1 [invalid_label] Label rogue is not declared");
		expect(stdout).toContain("TASK-1 [invalid_milestone] Milestone m-999 does not exist");
	});

	it("returns structured issue counts and issue details with --json", async () => {
		const core = new Core(TEST_DIR);
		await core.initializeProject("Validate JSON Project");
		const config = await core.filesystem.loadConfig();
		if (!config) {
			throw new Error("Expected config to exist");
		}
		await core.filesystem.saveConfig({
			...config,
			labels: ["docs"],
			validation: {
				requiredTaskFields: ["description", "documentation"],
			},
		});

		await core.filesystem.saveTask({
			id: "task-1",
			title: "Invalid JSON Task",
			status: "To Do",
			assignee: ["@codex"],
			createdDate: "2026-04-18 10:00",
			labels: ["rogue"],
			dependencies: ["task-999"],
			milestone: "m-999",
			rawContent: "",
		} as Task);

		const result = await $`bun ${cliPath} validate --json`.cwd(TEST_DIR).quiet().nothrow();

		expect(result.exitCode).toBe(1);
		const payload = JSON.parse(result.stdout.toString()) as {
			ok: boolean;
			command: string;
			valid: boolean;
			taskCount: number;
			issueCount: number;
			requiredTaskFields: string[];
			issueCounts: Record<string, number>;
			issues: Array<{ rule: string; field?: string; taskId: string }>;
		};

		expect(Object.keys(payload).sort()).toEqual([
			"command",
			"issueCount",
			"issueCounts",
			"issues",
			"ok",
			"requiredTaskFields",
			"taskCount",
			"valid",
		]);
		expect(payload.ok).toBe(true);
		expect(payload.command).toBe("validate");
		expect(payload.valid).toBe(false);
		expect(payload.taskCount).toBe(1);
		expect(payload.issueCount).toBe(5);
		expect(payload.requiredTaskFields).toEqual(["description", "documentation"]);
		expect(payload.issueCounts).toEqual({
			missing_required_field: 2,
			invalid_dependency: 1,
			invalid_label: 1,
			invalid_milestone: 1,
		});
		expect(payload.issues.map((issue) => issue.rule).sort()).toEqual([
			"invalid_dependency",
			"invalid_label",
			"invalid_milestone",
			"missing_required_field",
			"missing_required_field",
		]);
	});

	it("passes clean projects", async () => {
		const core = new Core(TEST_DIR);
		await core.initializeProject("Validate Clean Project");
		const milestone = await core.createMilestone("Release 1.0", "Scope");
		const config = await core.filesystem.loadConfig();
		if (!config) {
			throw new Error("Expected config to exist");
		}
		await core.filesystem.saveConfig({
			...config,
			labels: ["docs"],
			validation: {
				requiredTaskFields: ["description", "documentation", "assignee", "milestone"],
			},
		});

		await core.filesystem.saveTask({
			id: "task-1",
			title: "Valid Task",
			status: "To Do",
			assignee: ["@codex"],
			createdDate: "2026-04-18 10:00",
			labels: ["docs"],
			dependencies: [],
			description: "Has all required metadata",
			documentation: ["docs/spec.md"],
			milestone: milestone.id,
			rawContent: "",
		} as Task);

		const result = await $`bun ${cliPath} validate`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain("Validation passed. Checked 1 task.");
	});
});
