import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { join } from "node:path";
import { FileSystem } from "../file-system/operations.ts";
import { BacklogServer } from "../server/index.ts";
import type { Task } from "../types/index.ts";
import { createUniqueTestDir, retry, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
let server: BacklogServer | null = null;
let filesystem: FileSystem;
let serverPort = 0;

describe("BacklogServer governance endpoint", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("server-governance");
		filesystem = new FileSystem(TEST_DIR);
		await filesystem.ensureBacklogStructure();
		await filesystem.saveConfig({
			projectName: "Governance Server",
			statuses: ["To Do", "In Progress", "Done"],
			labels: ["docs"],
			dateFormat: "YYYY-MM-DD",
			remoteOperations: false,
		});
		await Bun.write(
			join(filesystem.milestonesDir, "m-1 - wave-1.md"),
			`---
id: m-1
title: "Wave 1"
---

## Description

Milestone: Wave 1
`,
		);
		await filesystem.saveTask({
			id: "TASK-1",
			title: "Needs documentation",
			status: "In Progress",
			assignee: ["@codex"],
			createdDate: "2026-04-18 10:00",
			labels: ["docs"],
			dependencies: [],
			milestone: "m-1",
			description: "Missing docs and summary parent",
		} as Task);

		server = new BacklogServer(TEST_DIR);
		await server.start(0, false);
		serverPort = server.getPort() ?? 0;

		await retry(
			async () => {
				const response = await fetch(`http://127.0.0.1:${serverPort}/api/tasks`);
				expect(response.ok).toBe(true);
			},
			10,
			100,
		);
	});

	afterEach(async () => {
		if (server) {
			await server.stop();
			server = null;
		}
		await safeCleanup(TEST_DIR);
	});

	it("returns a named governance report", async () => {
		const response = await fetch(`http://127.0.0.1:${serverPort}/api/governance/reports/missing-summary-parent`);
		expect(response.ok).toBe(true);
		const payload = (await response.json()) as {
			id: string;
			taskCount: number;
			findings: Array<{ taskId: string }>;
		};

		expect(payload.id).toBe("missing-summary-parent");
		expect(payload.taskCount).toBe(1);
		expect(payload.findings.map((finding) => finding.taskId)).toEqual(["TASK-1"]);
	});
});
