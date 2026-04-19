import { afterEach, describe, expect, it, mock } from "bun:test";
import { getWebRuntimeInfo } from "./version.ts";

const originalFetch = globalThis.fetch;

describe("getWebRuntimeInfo", () => {
	afterEach(() => {
		globalThis.fetch = originalFetch;
	});

	it("marks capability mismatch when the server returns legacy version-only data", async () => {
		globalThis.fetch = mock(
			async () =>
				new Response(JSON.stringify({ version: "1.0.0" }), {
					headers: { "Content-Type": "application/json" },
				}),
		) as unknown as typeof fetch;

		const info = await getWebRuntimeInfo();

		expect(info.version).toBe("1.0.0");
		expect(info.projectRoot).toBeNull();
		expect(info.capabilityMismatch).toBe(true);
		expect(info.warnings[0]).toContain("older or incompatible server");
	});

	it("returns runtime metadata without warnings when capabilities are present", async () => {
		globalThis.fetch = mock(
			async () =>
				new Response(
					JSON.stringify({
						version: "1.2.3",
						project: { root: "C:/DEV/Backlog.md", name: "Backlog.md" },
						runtime: { entry: "C:/DEV/Backlog.md/src/cli.ts" },
						capabilities: {
							runtimeMetadata: true,
							cliJson: true,
							validate: true,
						},
					}),
					{ headers: { "Content-Type": "application/json" } },
				),
		) as unknown as typeof fetch;

		const info = await getWebRuntimeInfo();

		expect(info).toEqual({
			version: "1.2.3",
			projectRoot: "C:/DEV/Backlog.md",
			projectName: "Backlog.md",
			runtimeEntry: "C:/DEV/Backlog.md/src/cli.ts",
			capabilityMismatch: false,
			warnings: [],
		});
	});
});
