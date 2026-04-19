import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { $ } from "bun";
import { Core } from "../index.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
const cliPath = join(process.cwd(), "src", "cli.ts");

describe("CLI milestone and task milestone", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("cli-milestones");
		try {
			await rm(TEST_DIR, { recursive: true, force: true });
		} catch {}
		await mkdir(TEST_DIR, { recursive: true });

		await $`git init -b main`.cwd(TEST_DIR).quiet();
		await $`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await $`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

		const core = new Core(TEST_DIR);
		await core.initializeProject("CLI Milestone Project");
	});

	afterEach(async () => {
		try {
			await safeCleanup(TEST_DIR);
		} catch {}
	});

	it("creates milestones and assigns tasks via CLI flags", async () => {
		const addA = await $`bun ${cliPath} milestone add "Release A"`.cwd(TEST_DIR).quiet();
		expect(addA.exitCode).toBe(0);
		expect(addA.stdout.toString()).toContain("Created milestone");

		const addB = await $`bun ${cliPath} milestone add "Release B"`.cwd(TEST_DIR).quiet();
		expect(addB.exitCode).toBe(0);

		const create = await $`bun ${cliPath} task create "Ship it" --milestone "Release A"`.cwd(TEST_DIR).quiet();
		expect(create.exitCode).toBe(0);

		const core = new Core(TEST_DIR);
		const task = await core.loadTaskById("TASK-1");
		expect(task?.milestone).toBe("m-0");

		const edit = await $`bun ${cliPath} task edit 1 --milestone "Release B"`.cwd(TEST_DIR).quiet();
		expect(edit.exitCode).toBe(0);
		const moved = await core.loadTaskById("TASK-1");
		expect(moved?.milestone).toBe("m-1");

		const clear = await $`bun ${cliPath} task edit 1 --clear-milestone`.cwd(TEST_DIR).quiet();
		expect(clear.exitCode).toBe(0);
		const cleared = await core.loadTaskById("TASK-1");
		expect(cleared?.milestone).toBeUndefined();
	});

	it("rejects milestone add when title collides with an existing milestone", async () => {
		await $`bun ${cliPath} milestone add "Release A"`.cwd(TEST_DIR).quiet();
		const dup = await $`bun ${cliPath} milestone add "release a"`.cwd(TEST_DIR).quiet().nothrow();
		expect(dup.exitCode).not.toBe(0);
		expect(dup.stderr.toString()).toContain("alias conflict");
	});

	it("renames a milestone and updates tasks", async () => {
		await $`bun ${cliPath} milestone add "Old Name"`.cwd(TEST_DIR).quiet();
		await $`bun ${cliPath} task create "T" --milestone "Old Name"`.cwd(TEST_DIR).quiet();

		const ren = await $`bun ${cliPath} milestone rename "Old Name" "New Name"`.cwd(TEST_DIR).quiet();
		expect(ren.exitCode).toBe(0);
		expect(ren.stdout.toString()).toContain("Renamed milestone");

		const core = new Core(TEST_DIR);
		const task = await core.loadTaskById("TASK-1");
		expect(task?.milestone).toBe("m-0");
	});

	it("lists tasks filtered by milestone and supports milestone view", async () => {
		await $`bun ${cliPath} milestone add "Sprint A"`.cwd(TEST_DIR).quiet();
		await $`bun ${cliPath} task create "In sprint" --milestone "Sprint A"`.cwd(TEST_DIR).quiet();
		await $`bun ${cliPath} task create "No milestone"`.cwd(TEST_DIR).quiet();

		const listM = await $`bun ${cliPath} task list -m "Sprint A" --plain`.cwd(TEST_DIR).quiet().nothrow();
		expect(listM.exitCode).toBe(0);
		expect(listM.stdout.toString()).toContain("In sprint");
		expect(listM.stdout.toString()).not.toContain("No milestone");

		const listNone = await $`bun ${cliPath} task list -m none --plain`.cwd(TEST_DIR).quiet().nothrow();
		expect(listNone.exitCode).toBe(0);
		expect(listNone.stdout.toString()).toContain("No milestone");
		expect(listNone.stdout.toString()).not.toContain("In sprint");

		const view = await $`bun ${cliPath} milestone view "Sprint A" --plain`.cwd(TEST_DIR).quiet().nothrow();
		expect(view.exitCode).toBe(0);
		expect(view.stdout.toString()).toContain("m-0");
		expect(view.stdout.toString()).toContain("Sprint A");
	});

	it("edits milestone descriptions via title and numeric alias", async () => {
		await $`bun ${cliPath} milestone add "Release A" -d "Original description"`.cwd(TEST_DIR).quiet();

		const byTitle = await $`bun ${cliPath} milestone edit "Release A" -d "Updated from title"`.cwd(TEST_DIR).quiet();
		expect(byTitle.exitCode).toBe(0);
		expect(byTitle.stdout.toString()).toContain('Updated milestone "Release A" (m-0) description.');

		const byAlias = await $`bun ${cliPath} milestone edit 0 -d "Updated from alias"`.cwd(TEST_DIR).quiet();
		expect(byAlias.exitCode).toBe(0);

		const milestoneFile = join(TEST_DIR, "backlog", "milestones", "m-0 - release-a.md");
		const content = await Bun.file(milestoneFile).text();
		expect(content).toContain("## Description\n\nUpdated from alias");

		const core = new Core(TEST_DIR);
		const milestone = await core.filesystem.loadMilestone("m-0");
		expect(milestone?.description).toBe("Updated from alias");
	});

	it("fails milestone edit when the milestone does not exist", async () => {
		const edit = await $`bun ${cliPath} milestone edit "Missing" -d "Nope"`.cwd(TEST_DIR).quiet().nothrow();
		expect(edit.exitCode).not.toBe(0);
		expect(edit.stderr.toString()).toContain('Milestone not found: "Missing"');
	});

	it("accepts --plain across milestone mutation commands", async () => {
		const add = await $`bun ${cliPath} milestone add "Release A" -d "Scope" --plain`.cwd(TEST_DIR).quiet();
		expect(add.exitCode).toBe(0);
		expect(add.stdout.toString()).toContain('Created milestone "Release A" (m-0).');

		const edit = await $`bun ${cliPath} milestone edit "Release A" -d "Updated scope" --plain`.cwd(TEST_DIR).quiet();
		expect(edit.exitCode).toBe(0);
		expect(edit.stdout.toString()).toContain('Updated milestone "Release A" (m-0) description.');

		await $`bun ${cliPath} task create "Ship it" --milestone "Release A"`.cwd(TEST_DIR).quiet();

		const rename = await $`bun ${cliPath} milestone rename "Release A" "Release B" --plain`.cwd(TEST_DIR).quiet();
		expect(rename.exitCode).toBe(0);
		expect(rename.stdout.toString()).toContain('Renamed milestone "Release A" (m-0) → "Release B" (m-0).');

		const remove = await $`bun ${cliPath} milestone remove "Release B" --tasks keep --plain`.cwd(TEST_DIR).quiet();
		expect(remove.exitCode).toBe(0);
		expect(remove.stdout.toString()).toContain('Removed milestone "Release B" (m-0).');

		await $`bun ${cliPath} milestone add "Release C" --plain`.cwd(TEST_DIR).quiet();
		const archive = await $`bun ${cliPath} milestone archive "Release C" --plain`.cwd(TEST_DIR).quiet();
		expect(archive.exitCode).toBe(0);
		expect(archive.stdout.toString()).toContain('Archived milestone "Release C" (m-1).');
	});

	it("bulk updates milestones for multiple tasks", async () => {
		await $`bun ${cliPath} milestone add "Release A"`.cwd(TEST_DIR).quiet();
		await $`bun ${cliPath} milestone add "Release B"`.cwd(TEST_DIR).quiet();
		await $`bun ${cliPath} task create "First task" --milestone "Release A"`.cwd(TEST_DIR).quiet();
		await $`bun ${cliPath} task create "Second task"`.cwd(TEST_DIR).quiet();

		const assign = await $`bun ${cliPath} task milestone 1 2 --milestone "Release B"`.cwd(TEST_DIR).quiet();
		expect(assign.exitCode).toBe(0);
		expect(assign.stdout.toString()).toContain("Set milestone to m-1 for 2 local tasks: TASK-1, TASK-2");

		const core = new Core(TEST_DIR);
		expect((await core.loadTaskById("TASK-1"))?.milestone).toBe("m-1");
		expect((await core.loadTaskById("TASK-2"))?.milestone).toBe("m-1");

		const clear = await $`bun ${cliPath} task milestone 1 2 999 --clear`.cwd(TEST_DIR).quiet();
		expect(clear.exitCode).toBe(0);
		const clearOutput = clear.stdout.toString();
		expect(clearOutput).toContain("Cleared milestone for 2 local tasks: TASK-1, TASK-2");
		expect(clearOutput).toContain("Skipped 1 unknown or non-local task ID: TASK-999");
		expect((await core.loadTaskById("TASK-1"))?.milestone).toBeUndefined();
		expect((await core.loadTaskById("TASK-2"))?.milestone).toBeUndefined();
	});
});
