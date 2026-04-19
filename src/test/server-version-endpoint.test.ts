import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { FileSystem } from "../file-system/operations.ts";
import { BacklogServer } from "../server/index.ts";
import { createUniqueTestDir, retry, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
let server: BacklogServer | null = null;
let filesystem: FileSystem;
let serverPort = 0;

describe("BacklogServer version endpoint", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("server-version");
		filesystem = new FileSystem(TEST_DIR);
		await filesystem.ensureBacklogStructure();
		await filesystem.saveConfig({
			projectName: "Version Project",
			statuses: ["To Do", "In Progress", "Done"],
			labels: [],
			milestones: [],
			dateFormat: "YYYY-MM-DD",
			remoteOperations: false,
		});

		server = new BacklogServer(TEST_DIR);
		await server.start(0, false);
		serverPort = server.getPort() ?? 0;
		expect(serverPort).toBeGreaterThan(0);
	});

	afterEach(async () => {
		if (server) {
			await server.stop();
			server = null;
		}
		await safeCleanup(TEST_DIR);
	});

	it("returns runtime identity, project source, and capability diagnostics", async () => {
		const payload = await retry(
			async () => {
				const response = await fetch(`http://127.0.0.1:${serverPort}/api/version`);
				expect(response.ok).toBe(true);
				return response.json();
			},
			10,
			100,
		);

		expect(payload.version).toEqual(expect.any(String));
		expect(payload.project).toEqual({
			root: TEST_DIR,
			name: "Version Project",
		});
		expect(payload.runtime).toEqual({
			executable: expect.any(String),
			entry: expect.any(String),
			cwd: expect.any(String),
			platform: expect.any(String),
		});
		expect(payload.capabilities).toEqual({
			runtimeMetadata: true,
			cliJson: true,
			validate: true,
		});
	});
});
