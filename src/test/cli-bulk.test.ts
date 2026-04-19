import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../core/backlog.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
const cliPath = join(process.cwd(), "src", "cli.ts");

describe("CLI task bulk updates", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("cli-bulk");
		await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
		await mkdir(TEST_DIR, { recursive: true });

		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

		const core = new Core(TEST_DIR);
		await core.initializeProject("CLI Bulk Test");
	});

	afterEach(async () => {
		try {
			await safeCleanup(TEST_DIR);
		} catch {}
	});

	it("previews filtered label updates without mutating tasks", async () => {
		await $`bun ${cliPath} task create "Preview First"`.cwd(TEST_DIR).quiet();
		await $`bun ${cliPath} task create "Preview Second"`.cwd(TEST_DIR).quiet();

		const result = await $`bun ${cliPath} task bulk --select-status "To Do" --add-label governance`
			.cwd(TEST_DIR)
			.quiet();

		expect(result.exitCode).toBe(0);
		const out = result.stdout.toString();
		expect(out).toContain("Bulk task update (preview)");
		expect(out).toContain("Matched local tasks: 2");
		expect(out).toContain("Add labels: governance");
		expect(out).toContain("Re-run with --apply to persist these changes.");

		const core = new Core(TEST_DIR);
		expect((await core.loadTaskById("TASK-1"))?.labels ?? []).toEqual([]);
		expect((await core.loadTaskById("TASK-2"))?.labels ?? []).toEqual([]);
	});

	it("applies documentation updates over explicit IDs", async () => {
		await $`bun ${cliPath} task create "Docs One"`.cwd(TEST_DIR).quiet();
		await $`bun ${cliPath} task create "Docs Two"`.cwd(TEST_DIR).quiet();

		const result = await $`bun ${cliPath} task bulk 1 2 --set-doc docs/spec.md --apply`.cwd(TEST_DIR).quiet();

		expect(result.exitCode).toBe(0);
		expect(result.stdout.toString()).toContain("Applied bulk task update to 2 local tasks.");

		const core = new Core(TEST_DIR);
		expect((await core.loadTaskById("TASK-1"))?.documentation).toEqual(["docs/spec.md"]);
		expect((await core.loadTaskById("TASK-2"))?.documentation).toEqual(["docs/spec.md"]);
	});

	it("applies milestone updates over query-selected tasks", async () => {
		await $`bun ${cliPath} milestone add "Release A"`.cwd(TEST_DIR).quiet();
		await $`bun ${cliPath} task create "Alpha scope"`.cwd(TEST_DIR).quiet();
		await $`bun ${cliPath} task create "Alpha polish"`.cwd(TEST_DIR).quiet();
		await $`bun ${cliPath} task create "Beta cleanup"`.cwd(TEST_DIR).quiet();

		const result = await $`bun ${cliPath} task bulk --query Alpha --set-milestone "Release A" --apply`
			.cwd(TEST_DIR)
			.quiet();

		expect(result.exitCode).toBe(0);
		const out = result.stdout.toString();
		expect(out).toContain("Bulk task update (apply)");
		expect(out).toContain("Matched local tasks: 2");
		expect(out).toContain("Set milestone: m-0");
		expect(out).toContain("Applied bulk task update to 2 local tasks.");

		const core = new Core(TEST_DIR);
		expect((await core.loadTaskById("TASK-1"))?.milestone).toBe("m-0");
		expect((await core.loadTaskById("TASK-2"))?.milestone).toBe("m-0");
		expect((await core.loadTaskById("TASK-3"))?.milestone).toBeUndefined();
	});
});
