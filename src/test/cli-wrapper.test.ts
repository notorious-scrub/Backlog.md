import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { spawnSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { Core } from "../core/backlog.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

// eslint-disable-next-line @typescript-eslint/no-var-requires
const { cleanCliArgs, resolveLaunchCommand } = require("../../scripts/cli.cjs");

let TEST_DIR: string;
const wrapperPath = join(process.cwd(), "scripts", "cli.cjs");

describe("CLI wrapper launch behavior", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("cli-wrapper");
		await rm(TEST_DIR, { recursive: true, force: true }).catch(() => {});
		await mkdir(TEST_DIR, { recursive: true });

		await Bun.$`git init -b main`.cwd(TEST_DIR).quiet();
		await Bun.$`git config user.name "Test User"`.cwd(TEST_DIR).quiet();
		await Bun.$`git config user.email test@example.com`.cwd(TEST_DIR).quiet();

		const core = new Core(TEST_DIR);
		await core.initializeProject("CLI Wrapper Test");
	});

	afterEach(async () => {
		try {
			await safeCleanup(TEST_DIR);
		} catch {}
	});

	it("prefers the source CLI when running from a source checkout", () => {
		const launch = resolveLaunchCommand({ repoRoot: process.cwd(), env: {} });
		expect(launch.mode).toBe("source");
		expect(launch.command).toBe("bun");
		expect(String(launch.args[0])).toContain(join("src", "cli.ts"));
	});

	it("cleans injected binary argv entries before forwarding", () => {
		const binaryPath = "C:\\repo\\node_modules\\backlog.md-windows-x64\\backlog.exe";
		const cleaned = cleanCliArgs(
			[
				"task",
				"edit",
				binaryPath,
				"--append-notes",
				"Line 1\nLine 2",
				"C:\\repo\\node_modules\\backlog.md-linux-x64\\backlog",
			],
			binaryPath,
		);
		expect(cleaned).toEqual(["task", "edit", "--append-notes", "Line 1\nLine 2"]);
	});

	it("reports the current source package version through the repo wrapper", async () => {
		const pkg = JSON.parse(await readFile(join(process.cwd(), "package.json"), "utf8"));
		const result = spawnSync("node", [wrapperPath, "--version"], {
			cwd: process.cwd(),
			encoding: "utf8",
		});

		expect(result.status).toBe(0);
		expect(result.stdout).toContain(String(pkg.version));
	});

	it("preserves common task create and edit arguments through PowerShell", async () => {
		const create = spawnSync(
			"powershell",
			[
				"-NoProfile",
				"-Command",
				`node "${wrapperPath}" task create "Wrapper Task" --assignee "@codex" --doc docs/wrapper.md --plain`,
			],
			{
				cwd: TEST_DIR,
				encoding: "utf8",
			},
		);
		expect(create.status).toBe(0);
		expect(create.stdout).toContain("Task TASK-1 - Wrapper Task");

		const edit = spawnSync(
			"powershell",
			[
				"-NoProfile",
				"-Command",
				`node "${wrapperPath}" task edit 1 --append-notes "Line 1\`nLine 2" --append-notes "Line 3" --plain`,
			],
			{
				cwd: TEST_DIR,
				encoding: "utf8",
			},
		);
		expect(edit.status).toBe(0);
		expect(edit.stdout).toContain("Line 1");
		expect(edit.stdout).toContain("Line 2");
		expect(edit.stdout).toContain("Line 3");

		const core = new Core(TEST_DIR);
		const task = await core.loadTaskById("TASK-1");
		expect(task?.assignee).toEqual(["@codex"]);
		expect(task?.documentation).toEqual(["docs/wrapper.md"]);
		expect(task?.implementationNotes).toContain("Line 1\nLine 2");
		expect(task?.implementationNotes).toContain("Line 3");
	});

	it("preserves common milestone create and edit arguments through PowerShell", async () => {
		const add = spawnSync(
			"powershell",
			["-NoProfile", "-Command", `node "${wrapperPath}" milestone add "Release A" -d "Line 1\`nLine 2" --plain`],
			{
				cwd: TEST_DIR,
				encoding: "utf8",
			},
		);
		expect(add.status).toBe(0);
		expect(add.stdout).toContain('Created milestone "Release A" (m-0).');

		const edit = spawnSync(
			"powershell",
			[
				"-NoProfile",
				"-Command",
				`node "${wrapperPath}" milestone edit "Release A" -d "Updated line 1\`nUpdated line 2" --plain`,
			],
			{
				cwd: TEST_DIR,
				encoding: "utf8",
			},
		);
		expect(edit.status).toBe(0);
		expect(edit.stdout).toContain('Updated milestone "Release A" (m-0) description.');

		const milestoneFile = await readFile(join(TEST_DIR, "backlog", "milestones", "m-0 - release-a.md"), "utf8");
		expect(milestoneFile).toContain("Updated line 1");
		expect(milestoneFile).toContain("Updated line 2");
	});
});
