import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { FileSystem } from "../file-system/operations.ts";
import { BacklogServer } from "../server/index.ts";
import { createUniqueTestDir, retry, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
let filesystem: FileSystem;
let server: BacklogServer | null = null;
let serverPort = 0;

describe("BacklogServer screenshot serving", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("server-screenshots");
		filesystem = new FileSystem(TEST_DIR);
		await filesystem.ensureBacklogStructure();

		await filesystem.saveConfig({
			projectName: "Server Screenshots",
			statuses: ["To Do", "In Progress", "Done"],
			labels: [],
			milestones: [],
			dateFormat: "YYYY-MM-DD",
			remoteOperations: false,
		});

		const backlogRoot = dirname(filesystem.docsDir);
		const imagesDir = join(backlogRoot, "images");
		await mkdir(join(imagesDir, "nested"), { recursive: true });

		await Bun.write(join(imagesDir, "ss1.png"), "PNGSCREENSHOT");
		await Bun.write(join(imagesDir, "nested", "flow.webp"), "WEBPSCREENSHOT");
		await Bun.write(join(imagesDir, "ignore.txt"), "not-an-image");

		server = new BacklogServer(TEST_DIR);
		await server.start(0, false);
		const port = server.getPort();
		expect(port).not.toBeNull();
		serverPort = port ?? 0;

		await retry(
			async () => {
				const res = await fetch(`http://127.0.0.1:${serverPort}/`);
				if (!res.ok) throw new Error("server not ready");
				return true;
			},
			10,
			50,
		);
	});

	afterEach(async () => {
		if (server) {
			await server.stop();
			server = null;
		}
		await safeCleanup(TEST_DIR);
	});

	it("lists screenshots under backlog/images via /api/screenshots", async () => {
		const res = await fetch(`http://127.0.0.1:${serverPort}/api/screenshots`);
		expect(res.status).toBe(200);
		const body = (await res.json()) as string[];
		expect(body).toEqual(["nested/flow.webp", "ss1.png"]);
	});

	it("uploads pasted screenshots via /api/screenshots POST", async () => {
		const formData = new FormData();
		formData.append("file", new File(["PNGPASTE"], "clipboard.png", { type: "image/png" }));
		formData.append("prefix", "task");
		formData.append("filename", "pasted-clipboard");

		const uploadRes = await fetch(`http://127.0.0.1:${serverPort}/api/screenshots`, {
			method: "POST",
			body: formData,
		});
		expect(uploadRes.status).toBe(200);
		const uploadBody = (await uploadRes.json()) as { path?: string; reference?: string; url?: string };
		expect(typeof uploadBody.path).toBe("string");
		expect(uploadBody.path?.startsWith("task-pasted-clipboard-")).toBe(true);
		expect(uploadBody.path?.endsWith(".png")).toBe(true);
		expect(uploadBody.reference).toBe(`backlog/images/${uploadBody.path}`);
		expect(uploadBody.url).toBe(`/images/${encodeURIComponent(uploadBody.path ?? "")}`);
		const uploadedPath = uploadBody.path ?? "";

		const listingRes = await fetch(`http://127.0.0.1:${serverPort}/api/screenshots`);
		expect(listingRes.status).toBe(200);
		const listing = (await listingRes.json()) as string[];
		expect(listing).toContain(uploadedPath);

		const uploadedImageRes = await fetch(`http://127.0.0.1:${serverPort}/images/${encodeURIComponent(uploadedPath)}`);
		expect(uploadedImageRes.status).toBe(200);
		expect(uploadedImageRes.headers.get("content-type")).toBe("image/png");
		expect(await uploadedImageRes.text()).toBe("PNGPASTE");
	});

	it("uses tidy task-scoped screenshot naming when taskId is provided", async () => {
		const formDataFirst = new FormData();
		formDataFirst.append("file", new File(["PNGPASTE1"], "clipboard.png", { type: "image/png" }));
		formDataFirst.append("taskId", "TASK-12");
		const firstUploadRes = await fetch(`http://127.0.0.1:${serverPort}/api/screenshots`, {
			method: "POST",
			body: formDataFirst,
		});
		expect(firstUploadRes.status).toBe(200);
		const firstUploadBody = (await firstUploadRes.json()) as { path?: string };
		expect(firstUploadBody.path).toBe("task-12-screenshot-1.png");

		const formDataSecond = new FormData();
		formDataSecond.append("file", new File(["PNGPASTE2"], "clipboard.png", { type: "image/png" }));
		formDataSecond.append("taskId", "12");
		const secondUploadRes = await fetch(`http://127.0.0.1:${serverPort}/api/screenshots`, {
			method: "POST",
			body: formDataSecond,
		});
		expect(secondUploadRes.status).toBe(200);
		const secondUploadBody = (await secondUploadRes.json()) as { path?: string };
		expect(secondUploadBody.path).toBe("task-12-screenshot-2.png");
	});

	it("serves screenshots from /images/*", async () => {
		const res = await fetch(`http://127.0.0.1:${serverPort}/images/ss1.png`);
		expect(res.status).toBe(200);
		expect(res.headers.get("content-type")).toBe("image/png");
		const body = await res.text();
		expect(body).toBe("PNGSCREENSHOT");
	});

	it("rejects /images path traversal attempts", async () => {
		const res = await fetch(`http://127.0.0.1:${serverPort}/images/../config.yml`);
		expect(res.status).toBe(404);

		const res2 = await fetch(`http://127.0.0.1:${serverPort}/images/%2e%2e/config.yml`);
		expect(res2.status).toBe(404);
	});
});
