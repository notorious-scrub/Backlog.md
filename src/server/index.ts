import { mkdir, readdir } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import type { Server, ServerWebSocket } from "bun";
import { $ } from "bun";
import {
	getAutomatedQaStaleThresholdMs,
	listRecentAutomatedQaRuns,
	loadAutomatedQaState,
	normalizeAgentAutomationConfigs,
	normalizeAutomatedQaConfig,
	spawnAutomatedQaWorker,
	toAgentAutomationConfig,
} from "../core/automated-qa.ts";
import { Core } from "../core/backlog.ts";
import type { ContentStore } from "../core/content-store.ts";
import { initializeProject } from "../core/init.ts";
import type { SearchService } from "../core/search-service.ts";
import { getTaskStatistics } from "../core/statistics.ts";
import type {
	BacklogConfig,
	SearchPriorityFilter,
	SearchResultType,
	Task,
	TaskAuditActor,
	TaskAuditEventFilter,
	TaskAuditEventType,
	TaskUpdateInput,
} from "../types/index.ts";
import { watchConfig } from "../utils/config-watcher.ts";
import { resolveMilestoneInputFromLists } from "../utils/milestone-input.ts";
import { getVersion } from "../utils/version.ts";

// Regex pattern to match any prefix (letters followed by dash)
const PREFIX_PATTERN = /^[a-zA-Z]+-/i;
const DEFAULT_PREFIX = "task-";

/**
 * Strip any prefix from an ID (e.g., "task-123" -> "123", "JIRA-456" -> "456")
 */
function stripPrefix(id: string): string {
	return id.replace(PREFIX_PATTERN, "");
}

/**
 * Ensure an ID has a prefix. If it already has one, return as-is.
 * Otherwise, add the default "task-" prefix.
 */
function ensurePrefix(id: string): string {
	if (PREFIX_PATTERN.test(id)) {
		return id;
	}
	return `${DEFAULT_PREFIX}${id}`;
}

function parseTaskIdSegments(value: string): number[] | null {
	const withoutPrefix = stripPrefix(value);
	if (!/^[0-9]+(?:\.[0-9]+)*$/.test(withoutPrefix)) {
		return null;
	}
	return withoutPrefix.split(".").map((segment) => Number.parseInt(segment, 10));
}

function findTaskByLooseId(tasks: Task[], inputId: string): Task | undefined {
	// First try exact match (case-insensitive)
	const lowerInputId = inputId.toLowerCase();
	const exact = tasks.find((task) => task.id.toLowerCase() === lowerInputId);
	if (exact) {
		return exact;
	}

	// Try matching by numeric segments only
	const inputSegments = parseTaskIdSegments(inputId);
	if (!inputSegments) {
		return undefined;
	}

	return tasks.find((task) => {
		const candidateSegments = parseTaskIdSegments(task.id);
		if (!candidateSegments || candidateSegments.length !== inputSegments.length) {
			return false;
		}
		for (let index = 0; index < candidateSegments.length; index += 1) {
			if (candidateSegments[index] !== inputSegments[index]) {
				return false;
			}
		}
		return true;
	});
}

// @ts-expect-error
import favicon from "../web/favicon.png" with { type: "file" };
import indexHtml from "../web/index.html";

export class BacklogServer {
	private core: Core;
	private server: Server<unknown> | null = null;
	private projectName = "Untitled Project";
	private sockets = new Set<ServerWebSocket<unknown>>();
	private contentStore: ContentStore | null = null;
	private searchService: SearchService | null = null;
	private unsubscribeContentStore?: () => void;
	private storeReadyBroadcasted = false;
	private configWatcher: { stop: () => void } | null = null;

	constructor(projectPath: string) {
		this.core = new Core(projectPath, { enableWatchers: true });
	}

	private async resolveMilestoneInput(milestone: string): Promise<string> {
		const normalized = milestone.trim();
		if (!normalized) {
			return normalized;
		}

		const [activeMilestones, archivedMilestones] = await Promise.all([
			this.core.filesystem.listMilestones(),
			this.core.filesystem.listArchivedMilestones(),
		]);
		return resolveMilestoneInputFromLists(activeMilestones, archivedMilestones, milestone);
	}

	private buildWebAuditActor(): TaskAuditActor {
		const userId = (process.env.USERNAME || process.env.USER || "").trim();
		return {
			kind: "user",
			source: "web",
			...(userId ? { id: userId, displayName: userId } : {}),
		};
	}

	private parseAuditEventType(value: string | null): TaskAuditEventType | undefined {
		switch (value) {
			case "task_status_changed":
			case "task_assignee_changed":
			case "task_labels_changed":
			case "task_priority_changed":
			case "task_milestone_changed":
			case "automation_run_queued":
			case "automation_run_dequeued":
			case "automation_task_claimed":
			case "automation_reviewer_launching":
			case "automation_reviewer_started":
			case "automation_reviewer_output":
			case "automation_run_succeeded":
			case "automation_run_failed":
			case "automation_run_skipped":
			case "automation_run_abandoned":
			case "automation_queue_paused":
				return value;
			default:
				return undefined;
		}
	}

	private buildAuditEventFilter(req: Request, taskId?: string): TaskAuditEventFilter {
		const url = new URL(req.url);
		const limitRaw = url.searchParams.get("limit");
		const parsedLimit = limitRaw ? Number.parseInt(limitRaw, 10) : Number.NaN;
		const limit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;
		const cursor = url.searchParams.get("cursor")?.trim() || undefined;
		const automationId = url.searchParams.get("automationId")?.trim() || undefined;
		const eventType = this.parseAuditEventType(url.searchParams.get("eventType"));
		const queryTaskId = url.searchParams.get("taskId")?.trim() || undefined;
		const normalizedTaskId = taskId ?? (queryTaskId ? ensurePrefix(queryTaskId) : undefined);
		return {
			...(normalizedTaskId ? { taskId: normalizedTaskId } : {}),
			...(automationId ? { automationId } : {}),
			...(eventType ? { eventType } : {}),
			...(limit !== undefined ? { limit } : {}),
			...(cursor ? { cursor } : {}),
		};
	}

	private async ensureServicesReady(): Promise<void> {
		const store = await this.core.getContentStore();
		this.contentStore = store;

		if (!this.unsubscribeContentStore) {
			this.unsubscribeContentStore = store.subscribe((event) => {
				if (event.type === "ready") {
					if (!this.storeReadyBroadcasted) {
						this.storeReadyBroadcasted = true;
						return;
					}
					this.broadcastTasksUpdated();
					return;
				}

				// Broadcast for tasks/documents/decisions so clients refresh caches/search
				this.storeReadyBroadcasted = true;
				this.broadcastTasksUpdated();
			});
		}

		const search = await this.core.getSearchService();
		this.searchService = search;
	}

	private async getContentStoreInstance(): Promise<ContentStore> {
		await this.ensureServicesReady();
		if (!this.contentStore) {
			throw new Error("Content store not initialized");
		}
		return this.contentStore;
	}

	private async getSearchServiceInstance(): Promise<SearchService> {
		await this.ensureServicesReady();
		if (!this.searchService) {
			throw new Error("Search service not initialized");
		}
		return this.searchService;
	}

	getPort(): number | null {
		return this.server?.port ?? null;
	}

	private broadcastTasksUpdated() {
		for (const ws of this.sockets) {
			try {
				ws.send("tasks-updated");
			} catch {}
		}
	}

	private broadcastConfigUpdated() {
		for (const ws of this.sockets) {
			try {
				ws.send("config-updated");
			} catch {}
		}
	}

	async start(port?: number, openBrowser = true): Promise<void> {
		// Prevent duplicate starts (e.g., accidental re-entry)
		if (this.server) {
			console.log("Server already running");
			return;
		}
		// Load config (migration is handled globally by CLI)
		const config = await this.core.filesystem.loadConfig();

		// Use config default port if no port specified
		const finalPort = port ?? config?.defaultPort ?? 6420;
		this.projectName = config?.projectName || "Untitled Project";

		// Check if browser should open (config setting or CLI override)
		// Default to true if autoOpenBrowser is not explicitly set to false
		const shouldOpenBrowser = openBrowser && (config?.autoOpenBrowser ?? true);

		// Set up config watcher to broadcast changes
		this.configWatcher = watchConfig(this.core, {
			onConfigChanged: () => {
				this.broadcastConfigUpdated();
			},
		});

		try {
			await this.ensureServicesReady();
			const agentAutomations = normalizeAgentAutomationConfigs(config?.agentAutomations, config?.automatedQa);
			if (agentAutomations.some((automation) => automation.enabled && !automation.paused)) {
				await spawnAutomatedQaWorker(this.core.filesystem.rootDir);
			}
			const serveOptions = {
				port: finalPort,
				development: process.env.NODE_ENV === "development",
				routes: {
					"/": indexHtml,
					"/tasks": indexHtml,
					"/milestones": indexHtml,
					"/drafts": indexHtml,
					"/documentation": indexHtml,
					"/documentation/*": indexHtml,
					"/decisions": indexHtml,
					"/decisions/*": indexHtml,
					"/statistics": indexHtml,
					"/settings": indexHtml,
					"/quick-task": indexHtml,

					// API Routes using Bun's native route syntax
					"/api/tasks": {
						GET: async (req: Request) => await this.handleListTasks(req),
						POST: async (req: Request) => await this.handleCreateTask(req),
					},
					"/api/task/:id": {
						GET: async (req: Request & { params: { id: string } }) => await this.handleGetTask(req.params.id),
					},
					"/api/tasks/:id": {
						GET: async (req: Request & { params: { id: string } }) => await this.handleGetTask(req.params.id),
						PUT: async (req: Request & { params: { id: string } }) => await this.handleUpdateTask(req, req.params.id),
						DELETE: async (req: Request & { params: { id: string } }) => await this.handleDeleteTask(req.params.id),
					},
					"/api/tasks/:id/audit-log": {
						GET: async (req: Request & { params: { id: string } }) =>
							await this.handleGetTaskAuditLog(req, req.params.id),
					},
					"/api/agent-automations/audit-log": {
						GET: async (req: Request) => await this.handleGetAgentAutomationAuditLog(req),
					},
					"/api/tasks/:id/complete": {
						POST: async (req: Request & { params: { id: string } }) => await this.handleCompleteTask(req.params.id),
					},
					"/api/statuses": {
						GET: async () => await this.handleGetStatuses(),
					},
					"/api/config": {
						GET: async () => await this.handleGetConfig(),
						PUT: async (req: Request) => await this.handleUpdateConfig(req),
					},
					"/api/automated-qa": {
						GET: async () => await this.handleGetAutomatedQa(),
					},
					"/api/docs": {
						GET: async () => await this.handleListDocs(),
						POST: async (req: Request) => await this.handleCreateDoc(req),
					},
					"/api/doc/:id": {
						GET: async (req: Request & { params: { id: string } }) => await this.handleGetDoc(req.params.id),
					},
					"/api/docs/:id": {
						GET: async (req: Request & { params: { id: string } }) => await this.handleGetDoc(req.params.id),
						PUT: async (req: Request & { params: { id: string } }) => await this.handleUpdateDoc(req, req.params.id),
					},
					"/api/decisions": {
						GET: async () => await this.handleListDecisions(),
						POST: async (req: Request) => await this.handleCreateDecision(req),
					},
					"/api/decision/:id": {
						GET: async (req: Request & { params: { id: string } }) => await this.handleGetDecision(req.params.id),
					},
					"/api/decisions/:id": {
						GET: async (req: Request & { params: { id: string } }) => await this.handleGetDecision(req.params.id),
						PUT: async (req: Request & { params: { id: string } }) =>
							await this.handleUpdateDecision(req, req.params.id),
					},
					"/api/drafts": {
						GET: async () => await this.handleListDrafts(),
					},
					"/api/drafts/:id/promote": {
						POST: async (req: Request & { params: { id: string } }) => await this.handlePromoteDraft(req.params.id),
					},
					"/api/milestones": {
						GET: async () => await this.handleListMilestones(),
						POST: async (req: Request) => await this.handleCreateMilestone(req),
					},
					"/api/milestones/archived": {
						GET: async () => await this.handleListArchivedMilestones(),
					},
					"/api/milestones/:id": {
						GET: async (req: Request & { params: { id: string } }) => await this.handleGetMilestone(req.params.id),
					},
					"/api/milestones/:id/archive": {
						POST: async (req: Request & { params: { id: string } }) => await this.handleArchiveMilestone(req.params.id),
					},
					"/api/tasks/reorder": {
						POST: async (req: Request) => await this.handleReorderTask(req),
					},
					"/api/tasks/cleanup": {
						GET: async (req: Request) => await this.handleCleanupPreview(req),
					},
					"/api/tasks/cleanup/execute": {
						POST: async (req: Request) => await this.handleCleanupExecute(req),
					},
					"/api/version": {
						GET: async () => await this.handleGetVersion(),
					},
					"/api/statistics": {
						GET: async () => await this.handleGetStatistics(),
					},
					"/api/status": {
						GET: async () => await this.handleGetStatus(),
					},
					"/api/init": {
						POST: async (req: Request) => await this.handleInit(req),
					},
					"/api/search": {
						GET: async (req: Request) => await this.handleSearch(req),
					},
					"/api/screenshots": {
						GET: async () => await this.handleListScreenshots(),
						POST: async (req: Request) => await this.handleUploadScreenshot(req),
					},
					"/sequences": {
						GET: async () => await this.handleGetSequences(),
					},
					"/sequences/move": {
						POST: async (req: Request) => await this.handleMoveSequence(req),
					},
					"/api/sequences": {
						GET: async () => await this.handleGetSequences(),
					},
					"/api/sequences/move": {
						POST: async (req: Request) => await this.handleMoveSequence(req),
					},
					// Serve files placed under backlog/assets at /assets/<relative-path>
					"/assets/*": {
						GET: async (req: Request) => await this.handleAssetRequest(req),
					},
					// Serve files placed under backlog/images at /images/<relative-path>
					"/images/*": {
						GET: async (req: Request) => await this.handleScreenshotRequest(req),
					},
				},
				fetch: async (req: Request, server: Server<unknown>) => {
					const res = await this.handleRequest(req, server);

					// Disable caching for GET/HEAD so browser always fetches latest content
					if (req.method === "GET" || req.method === "HEAD") {
						res.headers.set("Cache-Control", "no-store, max-age=0, must-revalidate");
						res.headers.set("Pragma", "no-cache");
						res.headers.set("Expires", "0");
					}

					return res;
				},
				error: this.handleError.bind(this),
				websocket: {
					open: (ws: ServerWebSocket) => {
						this.sockets.add(ws);
					},
					message(ws: ServerWebSocket) {
						ws.send("pong");
					},
					close: (ws: ServerWebSocket) => {
						this.sockets.delete(ws);
					},
				},
				/* biome-ignore format: keep cast on single line below for type narrowing */
			};
			this.server = Bun.serve(serveOptions as unknown as Parameters<typeof Bun.serve>[0]);

			const url = `http://localhost:${finalPort}`;
			console.log(`🚀 Backlog.md browser interface running at ${url}`);
			console.log(`📊 Project: ${this.projectName}`);
			const stopKey = process.platform === "darwin" ? "Cmd+C" : "Ctrl+C";
			console.log(`⏹️  Press ${stopKey} to stop the server`);

			if (shouldOpenBrowser) {
				console.log("🌐 Opening browser...");
				await this.openBrowser(url);
			} else {
				console.log("💡 Open your browser and navigate to the URL above");
			}
		} catch (error) {
			// Handle port already in use error
			const errorCode = (error as { code?: string })?.code;
			const errorMessage = (error as Error)?.message;
			if (errorCode === "EADDRINUSE" || errorMessage?.includes("address already in use")) {
				console.error(`\n❌ Error: Port ${finalPort} is already in use.\n`);
				console.log("💡 Suggestions:");
				console.log(`   1. Try a different port: backlog browser --port ${finalPort + 1}`);
				console.log(`   2. Find what's using port ${finalPort}:`);
				if (process.platform === "darwin" || process.platform === "linux") {
					console.log(`      Run: lsof -i :${finalPort}`);
				} else if (process.platform === "win32") {
					console.log(`      Run: netstat -ano | findstr :${finalPort}`);
				}
				console.log("   3. Or kill the process using the port and try again\n");
				process.exit(1);
			}

			// Handle other errors
			console.error("❌ Failed to start server:", errorMessage || error);
			process.exit(1);
		}
	}

	private _stopping = false;

	async stop(): Promise<void> {
		if (this._stopping) return;
		this._stopping = true;

		// Stop filesystem watcher first to reduce churn
		try {
			this.unsubscribeContentStore?.();
			this.unsubscribeContentStore = undefined;
		} catch {}

		// Stop config watcher
		try {
			this.configWatcher?.stop();
			this.configWatcher = null;
		} catch {}

		this.core.disposeSearchService();
		this.core.disposeContentStore();
		this.searchService = null;
		this.contentStore = null;
		this.storeReadyBroadcasted = false;

		// Proactively close WebSocket connections
		for (const ws of this.sockets) {
			try {
				ws.close();
			} catch {}
		}
		this.sockets.clear();

		// Attempt to stop the server but don't hang forever
		if (this.server) {
			const serverRef = this.server;
			const stopPromise = (async () => {
				try {
					await serverRef.stop();
				} catch {}
			})();
			const timeout = new Promise<void>((resolve) => setTimeout(resolve, 1500));
			await Promise.race([stopPromise, timeout]);
			this.server = null;
			console.log("Server stopped");
		}

		this._stopping = false;
	}

	private async openBrowser(url: string): Promise<void> {
		try {
			const platform = process.platform;
			let cmd: string[];

			switch (platform) {
				case "darwin": // macOS
					cmd = ["open", url];
					break;
				case "win32": // Windows
					cmd = ["cmd", "/c", "start", "", url];
					break;
				default: // Linux and others
					cmd = ["xdg-open", url];
					break;
			}

			await $`${cmd}`.quiet();
		} catch (error) {
			console.warn("⚠️  Failed to open browser automatically:", error);
			console.log("💡 Please open your browser manually and navigate to the URL above");
		}
	}

	private async handleAssetRequest(req: Request): Promise<Response> {
		return this.handleBacklogFileRequest(req, "/assets/", "assets");
	}

	private async handleScreenshotRequest(req: Request): Promise<Response> {
		return this.handleBacklogFileRequest(req, "/images/", "images");
	}

	private async handleBacklogFileRequest(req: Request, urlPrefix: string, folderName: string): Promise<Response> {
		try {
			const url = new URL(req.url);
			const pathname = decodeURIComponent(url.pathname || "");
			if (!pathname.startsWith(urlPrefix)) return new Response("Not Found", { status: 404 });

			const relPath = pathname.slice(urlPrefix.length);

			// disallow traversal
			if (relPath.includes("..")) return new Response("Not Found", { status: 404 });

			// derive backlog root from docsDir (parent of backlog/docs)
			const docsDir = this.core.filesystem.docsDir;
			const backlogRoot = dirname(docsDir);
			const rootDir = join(backlogRoot, folderName);
			const filePath = join(rootDir, relPath);

			if (!filePath.startsWith(rootDir)) return new Response("Not Found", { status: 404 });

			const file = Bun.file(filePath);
			if (!(await file.exists())) return new Response("Not Found", { status: 404 });

			const ext = (filePath.match(/\.([^./]+)$/) || [])[1]?.toLowerCase() || "";
			const mimeMap: Record<string, string> = {
				png: "image/png",
				jpg: "image/jpeg",
				jpeg: "image/jpeg",
				gif: "image/gif",
				svg: "image/svg+xml",
				webp: "image/webp",
				avif: "image/avif",
				pdf: "application/pdf",
				txt: "text/plain",
				css: "text/css",
				js: "application/javascript",
			};

			const mime = mimeMap[ext] ?? "application/octet-stream";
			return new Response(file, { headers: { "Content-Type": mime } });
		} catch (error) {
			console.error(`Error serving file from ${folderName}:`, error);
			return new Response("Internal Server Error", { status: 500 });
		}
	}

	private async handleRequest(req: Request, server: Server<unknown>): Promise<Response> {
		const url = new URL(req.url);
		const pathname = url.pathname;

		// Handle WebSocket upgrade
		if (req.headers.get("upgrade") === "websocket") {
			const success = server.upgrade(req, { data: undefined });
			if (success) {
				return new Response(null, { status: 101 }); // WebSocket upgrade response
			}
			return new Response("WebSocket upgrade failed", { status: 400 });
		}

		// Workaround as Bun doesn't support images imported from link tags in HTML
		if (pathname.startsWith("/favicon")) {
			const faviconFile = Bun.file(favicon);
			return new Response(faviconFile, {
				headers: { "Content-Type": "image/png" },
			});
		}

		// Bun HTMLBundle currently emits asset URLs like "/../../chunk-*.js" for this layout.
		// Browsers normalize those to "/chunk-*.js", which then miss route matching and 404.
		// Attempt to resolve normalized bundle asset paths by internally retrying with the
		// original bundle prefix.
		if (
			(req.method === "GET" || req.method === "HEAD") &&
			req.headers.get("x-backlog-asset-proxy") !== "1" &&
			!pathname.startsWith("/api/") &&
			!pathname.startsWith("/assets/") &&
			!pathname.startsWith("/images/") &&
			!pathname.startsWith("/favicon")
		) {
			const normalizedName = pathname.startsWith("/") ? pathname.slice(1) : pathname;
			if (normalizedName && !normalizedName.startsWith("../")) {
				const maybeAssetName = normalizedName.split("/").pop() ?? normalizedName;
				const directCandidates = [normalizedName];
				// Handle accidental prefixed paths like /ITSM-PLATFORM/cloud-forge/chunk-*.js
				if (/^(chunk-[^/]+|favicon-[^/]+\.png)$/i.test(maybeAssetName)) {
					directCandidates.unshift(maybeAssetName);
				}
				for (const candidate of directCandidates) {
					const prefixedUrl = new URL(url.toString());
					prefixedUrl.pathname = `/../../${candidate}`;
					try {
						const forwarded = await fetch(prefixedUrl.toString(), {
							method: req.method,
							headers: {
								"x-backlog-asset-proxy": "1",
							},
						});
						if (forwarded.ok) {
							return forwarded;
						}
					} catch {
						// ignore and continue to next candidate
					}
				}
			}
		}

		// For all other routes, return 404 since routes should handle all valid paths
		return new Response("Not Found", { status: 404 });
	}

	// Task handlers
	private async handleListTasks(req: Request): Promise<Response> {
		const url = new URL(req.url);
		const status = url.searchParams.get("status") || undefined;
		const assignee = url.searchParams.get("assignee") || undefined;
		const parent = url.searchParams.get("parent") || undefined;
		const priorityParam = url.searchParams.get("priority") || undefined;
		const crossBranch = url.searchParams.get("crossBranch") === "true";
		const labelParams = [...url.searchParams.getAll("label"), ...url.searchParams.getAll("labels")];
		const labelsCsv = url.searchParams.get("labels");
		if (labelsCsv) {
			labelParams.push(...labelsCsv.split(","));
		}
		const labels = labelParams.map((label) => label.trim()).filter((label) => label.length > 0);

		let priority: "high" | "medium" | "low" | undefined;
		if (priorityParam) {
			const normalizedPriority = priorityParam.toLowerCase();
			const allowed = ["high", "medium", "low"];
			if (!allowed.includes(normalizedPriority)) {
				return Response.json({ error: "Invalid priority filter" }, { status: 400 });
			}
			priority = normalizedPriority as "high" | "medium" | "low";
		}

		// Resolve parent task ID if provided
		let parentTaskId: string | undefined;
		if (parent) {
			const store = await this.getContentStoreInstance();
			const allTasks = store.getTasks();
			let parentTask = findTaskByLooseId(allTasks, parent);
			if (!parentTask) {
				const fallbackId = ensurePrefix(parent);
				const fallback = await this.core.filesystem.loadTask(fallbackId);
				if (fallback) {
					store.upsertTask(fallback);
					parentTask = fallback;
				}
			}
			if (!parentTask) {
				const normalizedParent = ensurePrefix(parent);
				return Response.json({ error: `Parent task ${normalizedParent} not found` }, { status: 404 });
			}
			parentTaskId = parentTask.id;
		}

		// Use Core.queryTasks which handles all filtering and cross-branch logic
		const tasks = await this.core.queryTasks({
			filters: { status, assignee, priority, parentTaskId, labels: labels.length > 0 ? labels : undefined },
			includeCrossBranch: crossBranch,
		});

		return Response.json(tasks);
	}

	private async handleSearch(req: Request): Promise<Response> {
		try {
			const searchService = await this.getSearchServiceInstance();
			const url = new URL(req.url);
			const query = url.searchParams.get("query") ?? undefined;
			const limitParam = url.searchParams.get("limit");
			const typeParams = [...url.searchParams.getAll("type"), ...url.searchParams.getAll("types")];
			const statusParams = url.searchParams.getAll("status");
			const priorityParamsRaw = url.searchParams.getAll("priority");
			const labelParamsRaw = [...url.searchParams.getAll("label"), ...url.searchParams.getAll("labels")];
			const labelsCsv = url.searchParams.get("labels");
			if (labelsCsv) {
				labelParamsRaw.push(...labelsCsv.split(","));
			}

			let limit: number | undefined;
			if (limitParam) {
				const parsed = Number.parseInt(limitParam, 10);
				if (Number.isNaN(parsed) || parsed <= 0) {
					return Response.json({ error: "limit must be a positive integer" }, { status: 400 });
				}
				limit = parsed;
			}

			let types: SearchResultType[] | undefined;
			if (typeParams.length > 0) {
				const allowed: SearchResultType[] = ["task", "document", "decision"];
				const normalizedTypes = typeParams
					.map((value) => value.toLowerCase())
					.filter((value): value is SearchResultType => {
						return allowed.includes(value as SearchResultType);
					});
				if (normalizedTypes.length === 0) {
					return Response.json({ error: "type must be task, document, or decision" }, { status: 400 });
				}
				types = normalizedTypes;
			}

			const filters: {
				status?: string | string[];
				priority?: SearchPriorityFilter | SearchPriorityFilter[];
				labels?: string | string[];
			} = {};

			if (statusParams.length === 1) {
				filters.status = statusParams[0];
			} else if (statusParams.length > 1) {
				filters.status = statusParams;
			}

			if (priorityParamsRaw.length > 0) {
				const allowedPriorities: SearchPriorityFilter[] = ["high", "medium", "low"];
				const normalizedPriorities = priorityParamsRaw.map((value) => value.toLowerCase());
				const invalidPriority = normalizedPriorities.find(
					(value) => !allowedPriorities.includes(value as SearchPriorityFilter),
				);
				if (invalidPriority) {
					return Response.json(
						{ error: `Unsupported priority '${invalidPriority}'. Use high, medium, or low.` },
						{ status: 400 },
					);
				}
				const casted = normalizedPriorities as SearchPriorityFilter[];
				filters.priority = casted.length === 1 ? casted[0] : casted;
			}

			if (labelParamsRaw.length > 0) {
				const normalizedLabels = labelParamsRaw.map((value) => value.trim()).filter((value) => value.length > 0);
				if (normalizedLabels.length > 0) {
					filters.labels = normalizedLabels.length === 1 ? normalizedLabels[0] : normalizedLabels;
				}
			}

			const results = searchService.search({ query, limit, types, filters });
			return Response.json(results);
		} catch (error) {
			console.error("Error performing search:", error);
			return Response.json({ error: "Search failed" }, { status: 500 });
		}
	}

	private async handleCreateTask(req: Request): Promise<Response> {
		const payload = await req.json();

		if (!payload || typeof payload.title !== "string" || payload.title.trim().length === 0) {
			return Response.json({ error: "Title is required" }, { status: 400 });
		}

		const acceptanceCriteria = Array.isArray(payload.acceptanceCriteriaItems)
			? payload.acceptanceCriteriaItems
					.map((item: { text?: string; checked?: boolean }) => ({
						text: String(item?.text ?? "").trim(),
						checked: Boolean(item?.checked),
					}))
					.filter((item: { text: string }) => item.text.length > 0)
			: [];
		const definitionOfDoneAdd = Array.isArray(payload.definitionOfDoneAdd)
			? payload.definitionOfDoneAdd
					.map((item: unknown) => String(item ?? "").trim())
					.filter((item: string) => item.length > 0)
			: [];
		const disableDefinitionOfDoneDefaults = Boolean(payload.disableDefinitionOfDoneDefaults);

		try {
			const milestone =
				typeof payload.milestone === "string" ? await this.resolveMilestoneInput(payload.milestone) : undefined;

			const { task: createdTask } = await this.core.createTaskFromInput({
				title: payload.title,
				description: payload.description,
				status: payload.status,
				priority: payload.priority,
				milestone,
				labels: payload.labels,
				assignee: payload.assignee,
				dependencies: payload.dependencies,
				references: payload.references,
				parentTaskId: payload.parentTaskId,
				implementationPlan: payload.implementationPlan,
				implementationNotes: payload.implementationNotes,
				finalSummary: payload.finalSummary,
				acceptanceCriteria,
				definitionOfDoneAdd,
				disableDefinitionOfDoneDefaults,
			});
			return Response.json(createdTask, { status: 201 });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to create task";
			return Response.json({ error: message }, { status: 400 });
		}
	}

	private async handleGetTask(taskId: string): Promise<Response> {
		const store = await this.getContentStoreInstance();
		const tasks = store.getTasks();
		const task = findTaskByLooseId(tasks, taskId);
		if (!task) {
			const fallbackId = ensurePrefix(taskId);
			const fallback = await this.core.filesystem.loadTask(fallbackId);
			if (fallback) {
				store.upsertTask(fallback);
				return Response.json(fallback);
			}
			return Response.json({ error: "Task not found" }, { status: 404 });
		}
		return Response.json(task);
	}

	private async handleGetTaskAuditLog(req: Request, taskId: string): Promise<Response> {
		try {
			const page = await this.core.filesystem.listTaskAuditEvents(
				this.buildAuditEventFilter(req, ensurePrefix(taskId)),
			);
			return Response.json(page);
		} catch (error) {
			console.error("Error loading task audit log:", error);
			return Response.json({ error: "Failed to load task audit log" }, { status: 500 });
		}
	}

	private async handleGetAgentAutomationAuditLog(req: Request): Promise<Response> {
		try {
			const page = await this.core.filesystem.listTaskAuditEvents(this.buildAuditEventFilter(req));
			return Response.json(page);
		} catch (error) {
			console.error("Error loading automation audit log:", error);
			return Response.json({ error: "Failed to load automation audit log" }, { status: 500 });
		}
	}

	private async handleUpdateTask(req: Request, taskId: string): Promise<Response> {
		const updates = await req.json();
		const existingTask = await this.core.filesystem.loadTask(taskId);
		if (!existingTask) {
			return Response.json({ error: "Task not found" }, { status: 404 });
		}

		const updateInput: TaskUpdateInput = {};

		if ("title" in updates && typeof updates.title === "string") {
			updateInput.title = updates.title;
		}

		if ("description" in updates && typeof updates.description === "string") {
			updateInput.description = updates.description;
		}

		if ("status" in updates && typeof updates.status === "string") {
			updateInput.status = updates.status;
		}

		if ("priority" in updates && typeof updates.priority === "string") {
			updateInput.priority = updates.priority;
		}

		if ("milestone" in updates && (typeof updates.milestone === "string" || updates.milestone === null)) {
			if (typeof updates.milestone === "string") {
				updateInput.milestone = await this.resolveMilestoneInput(updates.milestone);
			} else {
				updateInput.milestone = updates.milestone;
			}
		}

		if ("labels" in updates && Array.isArray(updates.labels)) {
			updateInput.labels = updates.labels;
		}

		if ("assignee" in updates && Array.isArray(updates.assignee)) {
			updateInput.assignee = updates.assignee;
		}

		if ("dependencies" in updates && Array.isArray(updates.dependencies)) {
			updateInput.dependencies = updates.dependencies;
		}

		if ("references" in updates && Array.isArray(updates.references)) {
			updateInput.references = updates.references;
		}

		if ("implementationPlan" in updates && typeof updates.implementationPlan === "string") {
			updateInput.implementationPlan = updates.implementationPlan;
		}

		if ("implementationNotes" in updates && typeof updates.implementationNotes === "string") {
			updateInput.implementationNotes = updates.implementationNotes;
		}

		if ("finalSummary" in updates && typeof updates.finalSummary === "string") {
			updateInput.finalSummary = updates.finalSummary;
		}

		if ("acceptanceCriteriaItems" in updates && Array.isArray(updates.acceptanceCriteriaItems)) {
			updateInput.acceptanceCriteria = updates.acceptanceCriteriaItems
				.map((item: { text?: string; checked?: boolean }) => ({
					text: String(item?.text ?? "").trim(),
					checked: Boolean(item?.checked),
				}))
				.filter((item: { text: string }) => item.text.length > 0);
		}

		if ("definitionOfDoneAdd" in updates && Array.isArray(updates.definitionOfDoneAdd)) {
			updateInput.addDefinitionOfDone = updates.definitionOfDoneAdd
				.map((item: unknown) => ({ text: String(item ?? "").trim(), checked: false }))
				.filter((item: { text: string }) => item.text.length > 0);
		}

		if ("definitionOfDoneRemove" in updates && Array.isArray(updates.definitionOfDoneRemove)) {
			updateInput.removeDefinitionOfDone = updates.definitionOfDoneRemove.filter(
				(value: unknown) => typeof value === "number" && Number.isFinite(value),
			);
		}

		if ("definitionOfDoneCheck" in updates && Array.isArray(updates.definitionOfDoneCheck)) {
			updateInput.checkDefinitionOfDone = updates.definitionOfDoneCheck.filter(
				(value: unknown) => typeof value === "number" && Number.isFinite(value),
			);
		}

		if ("definitionOfDoneUncheck" in updates && Array.isArray(updates.definitionOfDoneUncheck)) {
			updateInput.uncheckDefinitionOfDone = updates.definitionOfDoneUncheck.filter(
				(value: unknown) => typeof value === "number" && Number.isFinite(value),
			);
		}

		try {
			const updatedTask = await this.core.updateTaskFromInput(
				taskId,
				updateInput,
				undefined,
				this.buildWebAuditActor(),
			);
			return Response.json(updatedTask);
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to update task";
			return Response.json({ error: message }, { status: 400 });
		}
	}

	private async handleDeleteTask(taskId: string): Promise<Response> {
		const success = await this.core.archiveTask(taskId);
		if (!success) {
			return Response.json({ error: "Task not found" }, { status: 404 });
		}
		return Response.json({ success: true });
	}

	private async handleCompleteTask(taskId: string): Promise<Response> {
		try {
			const task = await this.core.filesystem.loadTask(taskId);
			if (!task) {
				return Response.json({ error: "Task not found" }, { status: 404 });
			}

			const success = await this.core.completeTask(taskId);
			if (!success) {
				return Response.json({ error: "Failed to complete task" }, { status: 500 });
			}

			// Notify listeners to refresh
			this.broadcastTasksUpdated();
			return Response.json({ success: true });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to complete task";
			console.error("Error completing task:", error);
			return Response.json({ error: message }, { status: 500 });
		}
	}

	private async handleGetStatuses(): Promise<Response> {
		const config = await this.core.filesystem.loadConfig();
		const statuses = config?.statuses || ["To Do", "In Progress", "Done"];
		return Response.json(statuses);
	}

	private async handleListScreenshots(): Promise<Response> {
		try {
			const docsDir = this.core.filesystem.docsDir;
			const backlogRoot = dirname(docsDir);
			const imagesRoot = join(backlogRoot, "images");
			const screenshotPaths = await this.collectImagePaths(imagesRoot);
			return Response.json(screenshotPaths);
		} catch (error) {
			console.error("Error listing screenshots:", error);
			return Response.json([]);
		}
	}

	private sanitizeScreenshotName(value: string): string {
		const base = value
			.trim()
			.replace(/\\/g, "/")
			.split("/")
			.pop()
			?.replace(/[<>:"/\\|?*]/g, "")
			.replace(/\s+/g, "-")
			.replace(/[^a-zA-Z0-9._-]/g, "-")
			.replace(/-+/g, "-")
			.replace(/^\.+/, "")
			.replace(/\.+$/, "");
		return base && base.length > 0 ? base.slice(0, 120) : "screenshot";
	}

	private inferScreenshotExtension(mimeType: string, fallbackFilename?: string): string {
		const fromFilename = (fallbackFilename ?? "")
			.trim()
			.toLowerCase()
			.match(/\.([a-z0-9]+)$/)?.[1];
		if (fromFilename && /^[a-z0-9]+$/.test(fromFilename)) {
			return fromFilename;
		}
		switch (mimeType.toLowerCase()) {
			case "image/png":
				return "png";
			case "image/jpeg":
				return "jpg";
			case "image/webp":
				return "webp";
			case "image/gif":
				return "gif";
			case "image/svg+xml":
				return "svg";
			case "image/avif":
				return "avif";
			default:
				return "png";
		}
	}

	private buildTaskScreenshotStem(taskIdRaw: string): string {
		const normalized = stripPrefix(taskIdRaw.trim().toLowerCase())
			.replace(/[^a-z0-9]+/g, "-")
			.replace(/-+/g, "-")
			.replace(/^-+/, "")
			.replace(/-+$/, "");
		const taskBody = normalized.length > 0 ? normalized : "unknown";
		return `task-${taskBody}`;
	}

	private async getNextTaskScreenshotIndex(imagesRoot: string, stem: string): Promise<number> {
		const screenshotPaths = await this.collectImagePaths(imagesRoot);
		const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
		const pattern = new RegExp(`^${escapedStem}-screenshot-(\\d+)\\.[a-z0-9]+$`, "i");
		let maxIndex = 0;
		for (const screenshotPath of screenshotPaths) {
			const filename = screenshotPath.split("/").pop() ?? screenshotPath;
			const match = filename.match(pattern);
			if (!match?.[1]) {
				continue;
			}
			const parsed = Number.parseInt(match[1], 10);
			if (Number.isFinite(parsed) && parsed > maxIndex) {
				maxIndex = parsed;
			}
		}
		return maxIndex + 1;
	}

	private async handleUploadScreenshot(req: Request): Promise<Response> {
		try {
			const formData = await req.formData();
			const file = formData.get("file");
			if (!(file instanceof File)) {
				return Response.json({ error: "Missing file upload" }, { status: 400 });
			}
			if (!file.type.startsWith("image/")) {
				return Response.json({ error: "Uploaded file must be an image" }, { status: 400 });
			}

			const requestedFilenameRaw = typeof formData.get("filename") === "string" ? String(formData.get("filename")) : "";
			const prefixRaw = typeof formData.get("prefix") === "string" ? String(formData.get("prefix")) : "";
			const taskIdRaw = typeof formData.get("taskId") === "string" ? String(formData.get("taskId")) : "";
			const prefix = this.sanitizeScreenshotName(prefixRaw)
				.toLowerCase()
				.replace(/\.[a-z0-9]+$/i, "")
				.replace(/^-+/, "")
				.replace(/-+$/, "");

			const docsDir = this.core.filesystem.docsDir;
			const backlogRoot = dirname(docsDir);
			const imagesRoot = join(backlogRoot, "images");
			await mkdir(imagesRoot, { recursive: true });

			const preferredNameRaw = requestedFilenameRaw || file.name || "screenshot";
			const extension = this.inferScreenshotExtension(file.type, preferredNameRaw || file.name);
			let finalName: string;

			if (taskIdRaw.trim().length > 0) {
				const taskStem = this.buildTaskScreenshotStem(taskIdRaw);
				let nextIndex = await this.getNextTaskScreenshotIndex(imagesRoot, taskStem);
				let candidate = `${taskStem}-screenshot-${nextIndex}.${extension}`;
				// Protect against rare concurrent collisions.
				while (await Bun.file(join(imagesRoot, candidate)).exists()) {
					nextIndex += 1;
					candidate = `${taskStem}-screenshot-${nextIndex}.${extension}`;
				}
				finalName = candidate;
			} else {
				const preferredName = this.sanitizeScreenshotName(preferredNameRaw).replace(/\.[a-z0-9]+$/i, "");
				const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
				const randomSuffix = Math.random().toString(36).slice(2, 8);
				const stemParts = [prefix, preferredName, timestamp, randomSuffix].filter((part) => part.length > 0);
				finalName = `${stemParts.join("-")}.${extension}`;
			}
			const filepath = join(imagesRoot, finalName);

			await Bun.write(filepath, await file.arrayBuffer());

			return Response.json({
				path: finalName,
				reference: `backlog/images/${finalName}`,
				url: `/images/${encodeURIComponent(finalName)}`,
			});
		} catch (error) {
			console.error("Error uploading screenshot:", error);
			return Response.json({ error: "Failed to upload screenshot" }, { status: 500 });
		}
	}

	private async collectImagePaths(rootDir: string): Promise<string[]> {
		const imageExtensions = new Set([".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".avif"]);
		const collected: string[] = [];
		const walk = async (currentDir: string): Promise<void> => {
			let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }> = [];
			try {
				entries = await readdir(currentDir, { withFileTypes: true });
			} catch {
				return;
			}
			for (const entry of entries) {
				const fullPath = join(currentDir, entry.name);
				if (entry.isDirectory()) {
					await walk(fullPath);
					continue;
				}
				if (!entry.isFile()) {
					continue;
				}
				const lowerName = entry.name.toLowerCase();
				const extension = lowerName.includes(".") ? lowerName.slice(lowerName.lastIndexOf(".")) : "";
				if (!imageExtensions.has(extension)) {
					continue;
				}
				const relPath = relative(rootDir, fullPath).replace(/\\/g, "/");
				if (relPath.length > 0 && !relPath.includes("..")) {
					collected.push(relPath);
				}
			}
		};
		await walk(rootDir);
		collected.sort((a, b) => a.localeCompare(b));
		return collected;
	}

	// Documentation handlers
	private async handleListDocs(): Promise<Response> {
		try {
			const store = await this.getContentStoreInstance();
			const docs = store.getDocuments();
			const docFiles = docs.map((doc) => ({
				name: `${doc.title}.md`,
				id: doc.id,
				title: doc.title,
				type: doc.type,
				createdDate: doc.createdDate,
				updatedDate: doc.updatedDate,
				lastModified: doc.updatedDate || doc.createdDate,
				tags: doc.tags || [],
				path: doc.path,
				isLegacy: doc.isLegacy ?? doc.path?.replace(/\\/g, "/").toLowerCase().startsWith("legacy/") ?? false,
			}));
			return Response.json(docFiles);
		} catch (error) {
			console.error("Error listing documents:", error);
			return Response.json([]);
		}
	}

	private async handleGetDoc(docId: string): Promise<Response> {
		try {
			const doc = await this.core.getDocument(docId);
			if (!doc) {
				return Response.json({ error: "Document not found" }, { status: 404 });
			}
			return Response.json(doc);
		} catch (error) {
			console.error("Error loading document:", error);
			return Response.json({ error: "Document not found" }, { status: 404 });
		}
	}

	private async handleCreateDoc(req: Request): Promise<Response> {
		const { filename, content, isLegacy } = await req.json();

		try {
			const title = filename.replace(".md", "");
			const document = await this.core.createDocumentWithId(title, content, {
				subPath: isLegacy ? "legacy" : "",
			});
			return Response.json({ success: true, id: document.id }, { status: 201 });
		} catch (error) {
			console.error("Error creating document:", error);
			return Response.json({ error: "Failed to create document" }, { status: 500 });
		}
	}

	private async handleUpdateDoc(req: Request, docId: string): Promise<Response> {
		try {
			const body = await req.json();
			const content = typeof body?.content === "string" ? body.content : undefined;
			const title = typeof body?.title === "string" ? body.title : undefined;
			const isLegacy = typeof body?.isLegacy === "boolean" ? body.isLegacy : undefined;

			if (typeof content !== "string") {
				return Response.json({ error: "Document content is required" }, { status: 400 });
			}

			let normalizedTitle: string | undefined;

			if (typeof title === "string") {
				normalizedTitle = title.trim();
				if (normalizedTitle.length === 0) {
					return Response.json({ error: "Document title cannot be empty" }, { status: 400 });
				}
			}

			const existingDoc = await this.core.getDocument(docId);
			if (!existingDoc) {
				return Response.json({ error: "Document not found" }, { status: 404 });
			}

			const nextDoc = normalizedTitle ? { ...existingDoc, title: normalizedTitle } : { ...existingDoc };
			if (typeof isLegacy === "boolean") {
				const currentPath = nextDoc.path?.replace(/\\/g, "/") ?? "";
				const currentSegments = currentPath.split("/").filter((segment) => segment.length > 0);
				const filename = currentSegments.pop() ?? "";
				const normalizedSegments = currentSegments.filter((segment) => segment.toLowerCase() !== "legacy");
				if (filename.length > 0) {
					nextDoc.path = [...(isLegacy ? ["legacy"] : []), ...normalizedSegments, filename].join("/");
				}
				nextDoc.isLegacy = isLegacy;
			}

			await this.core.updateDocument(nextDoc, content);
			return Response.json({ success: true });
		} catch (error) {
			console.error("Error updating document:", error);
			if (error instanceof SyntaxError) {
				return Response.json({ error: "Invalid request payload" }, { status: 400 });
			}
			return Response.json({ error: "Failed to update document" }, { status: 500 });
		}
	}

	// Decision handlers
	private async handleListDecisions(): Promise<Response> {
		try {
			const store = await this.getContentStoreInstance();
			const decisions = store.getDecisions();
			const decisionFiles = decisions.map((decision) => ({
				id: decision.id,
				title: decision.title,
				status: decision.status,
				date: decision.date,
				context: decision.context,
				decision: decision.decision,
				consequences: decision.consequences,
				alternatives: decision.alternatives,
			}));
			return Response.json(decisionFiles);
		} catch (error) {
			console.error("Error listing decisions:", error);
			return Response.json([]);
		}
	}

	private async handleGetDecision(decisionId: string): Promise<Response> {
		try {
			const store = await this.getContentStoreInstance();
			const normalizedId = decisionId.startsWith("decision-") ? decisionId : `decision-${decisionId}`;
			const decision = store.getDecisions().find((item) => item.id === normalizedId || item.id === decisionId);

			if (!decision) {
				return Response.json({ error: "Decision not found" }, { status: 404 });
			}

			return Response.json(decision);
		} catch (error) {
			console.error("Error loading decision:", error);
			return Response.json({ error: "Decision not found" }, { status: 404 });
		}
	}

	private async handleCreateDecision(req: Request): Promise<Response> {
		const { title } = await req.json();

		try {
			const decision = await this.core.createDecisionWithTitle(title);
			return Response.json(decision, { status: 201 });
		} catch (error) {
			console.error("Error creating decision:", error);
			return Response.json({ error: "Failed to create decision" }, { status: 500 });
		}
	}

	private async handleUpdateDecision(req: Request, decisionId: string): Promise<Response> {
		const content = await req.text();

		try {
			await this.core.updateDecisionFromContent(decisionId, content);
			return Response.json({ success: true });
		} catch (error) {
			if (error instanceof Error && error.message.includes("not found")) {
				return Response.json({ error: "Decision not found" }, { status: 404 });
			}
			console.error("Error updating decision:", error);
			return Response.json({ error: "Failed to update decision" }, { status: 500 });
		}
	}

	private async handleGetConfig(): Promise<Response> {
		try {
			const config = await this.core.filesystem.loadConfig();
			if (!config) {
				return Response.json({ error: "Configuration not found" }, { status: 404 });
			}
			return Response.json(config);
		} catch (error) {
			console.error("Error loading config:", error);
			return Response.json({ error: "Failed to load configuration" }, { status: 500 });
		}
	}

	private async handleGetAutomatedQa(): Promise<Response> {
		try {
			const config = await this.core.filesystem.loadConfig();
			if (!config) {
				return Response.json({ error: "Configuration not found" }, { status: 404 });
			}
			const state = await loadAutomatedQaState(this.core.filesystem.rootDir);
			const recentRuns = await listRecentAutomatedQaRuns(this.core.filesystem.rootDir);
			return Response.json({
				config: normalizeAutomatedQaConfig(config.automatedQa),
				automations: normalizeAgentAutomationConfigs(config.agentAutomations, config.automatedQa).map((automation) =>
					toAgentAutomationConfig(automation),
				),
				state,
				staleThresholdMs: getAutomatedQaStaleThresholdMs(),
				recentRuns,
			});
		} catch (error) {
			console.error("Error loading automated QA state:", error);
			return Response.json({ error: "Failed to load automated QA state" }, { status: 500 });
		}
	}

	private async handleUpdateConfig(req: Request): Promise<Response> {
		try {
			const updatedConfig = (await req.json()) as BacklogConfig;
			const existingConfig = await this.core.filesystem.loadConfig();

			// Validate configuration
			if (!updatedConfig.projectName?.trim()) {
				return Response.json({ error: "Project name is required" }, { status: 400 });
			}

			if (updatedConfig.defaultPort && (updatedConfig.defaultPort < 1 || updatedConfig.defaultPort > 65535)) {
				return Response.json({ error: "Port must be between 1 and 65535" }, { status: 400 });
			}

			const requestedAgentAutomations =
				Array.isArray(updatedConfig.agentAutomations) && updatedConfig.agentAutomations.length > 0
					? updatedConfig.agentAutomations.map((automation, index) =>
							index === 0 && updatedConfig.automatedQa
								? {
										...automation,
										id: automation.id ?? "automated-qa",
										name: automation.name ?? "Automated QA",
										enabled: updatedConfig.automatedQa.enabled,
										paused: updatedConfig.automatedQa.paused,
										trigger: {
											...(automation.trigger ?? {}),
											type: "status_transition" as const,
											toStatus: updatedConfig.automatedQa.triggerStatus,
										},
										codexCommand: updatedConfig.automatedQa.codexCommand,
										agentName: updatedConfig.automatedQa.agentName,
										reviewerAssignee: updatedConfig.automatedQa.reviewerAssignee,
										timeoutSeconds: updatedConfig.automatedQa.timeoutSeconds,
									}
								: automation,
						)
					: updatedConfig.agentAutomations;
			const agentAutomations = normalizeAgentAutomationConfigs(requestedAgentAutomations, updatedConfig.automatedQa);
			for (const automation of agentAutomations) {
				if (
					automation.enabled &&
					automation.triggerStatus &&
					!updatedConfig.statuses.some(
						(status) => status.trim().toLowerCase() === automation.triggerStatus.toLowerCase(),
					)
				) {
					return Response.json(
						{ error: `Automation "${automation.name}" trigger status must match one of the configured statuses` },
						{ status: 400 },
					);
				}
				if (automation.timeoutSeconds < 30 || automation.timeoutSeconds > 7200) {
					return Response.json(
						{ error: `Automation "${automation.name}" timeout must be between 30 and 7200 seconds` },
						{ status: 400 },
					);
				}
				if (automation.maxConcurrentRuns < 1 || automation.maxConcurrentRuns > 25) {
					return Response.json(
						{ error: `Automation "${automation.name}" max concurrent runs must be between 1 and 25` },
						{ status: 400 },
					);
				}
			}
			const primaryAutomation =
				agentAutomations.find((automation) => automation.id === "automated-qa") ?? agentAutomations[0];
			updatedConfig.agentAutomations = agentAutomations.map((automation) => toAgentAutomationConfig(automation));
			updatedConfig.automatedQa = primaryAutomation
				? {
						enabled: primaryAutomation.enabled,
						paused: primaryAutomation.paused,
						triggerStatus: primaryAutomation.triggerStatus,
						codexCommand: primaryAutomation.codexCommand,
						agentName: primaryAutomation.agentName,
						reviewerAssignee: primaryAutomation.reviewerAssignee,
						timeoutSeconds: primaryAutomation.timeoutSeconds,
					}
				: normalizeAutomatedQaConfig(updatedConfig.automatedQa);

			// Save configuration
			await this.core.filesystem.saveConfig(updatedConfig);

			// Update local project name if changed
			if (updatedConfig.projectName !== this.projectName) {
				this.projectName = updatedConfig.projectName;
			}

			// Notify connected clients so that they refresh configuration-dependent data (e.g., statuses)
			this.broadcastTasksUpdated();

			const previousAutomations = normalizeAgentAutomationConfigs(
				existingConfig?.agentAutomations,
				existingConfig?.automatedQa,
			);
			const shouldStartWorker = agentAutomations.some((automation) => {
				if (!automation.enabled || automation.paused) {
					return false;
				}
				const previousAutomation = previousAutomations.find((entry) => entry.id === automation.id);
				return (
					!previousAutomation ||
					!previousAutomation.enabled ||
					previousAutomation.paused ||
					previousAutomation.triggerType !== automation.triggerType ||
					previousAutomation.triggerStatus !== automation.triggerStatus ||
					previousAutomation.maxConcurrentRuns !== automation.maxConcurrentRuns
				);
			});
			if (shouldStartWorker) {
				await spawnAutomatedQaWorker(this.core.filesystem.rootDir);
			}

			return Response.json(updatedConfig);
		} catch (error) {
			console.error("Error updating config:", error);
			return Response.json({ error: "Failed to update configuration" }, { status: 500 });
		}
	}

	private handleError(error: Error): Response {
		console.error("Server Error:", error);
		return new Response("Internal Server Error", { status: 500 });
	}

	// Draft handlers
	private async handleListDrafts(): Promise<Response> {
		try {
			const drafts = await this.core.filesystem.listDrafts();
			return Response.json(drafts);
		} catch (error) {
			console.error("Error listing drafts:", error);
			return Response.json([]);
		}
	}

	private async handlePromoteDraft(draftId: string): Promise<Response> {
		try {
			const success = await this.core.promoteDraft(draftId);
			if (!success) {
				return Response.json({ error: "Draft not found" }, { status: 404 });
			}
			return Response.json({ success: true });
		} catch (error) {
			console.error("Error promoting draft:", error);
			return Response.json({ error: "Failed to promote draft" }, { status: 500 });
		}
	}

	// Milestone handlers
	private async handleListMilestones(): Promise<Response> {
		try {
			const milestones = await this.core.filesystem.listMilestones();
			return Response.json(milestones);
		} catch (error) {
			console.error("Error listing milestones:", error);
			return Response.json([]);
		}
	}

	private async handleListArchivedMilestones(): Promise<Response> {
		try {
			const milestones = await this.core.filesystem.listArchivedMilestones();
			return Response.json(milestones);
		} catch (error) {
			console.error("Error listing archived milestones:", error);
			return Response.json([]);
		}
	}

	private async handleGetMilestone(milestoneId: string): Promise<Response> {
		try {
			const milestone = await this.core.filesystem.loadMilestone(milestoneId);
			if (!milestone) {
				return Response.json({ error: "Milestone not found" }, { status: 404 });
			}
			return Response.json(milestone);
		} catch (error) {
			console.error("Error loading milestone:", error);
			return Response.json({ error: "Milestone not found" }, { status: 404 });
		}
	}

	private async handleCreateMilestone(req: Request): Promise<Response> {
		try {
			const body = (await req.json()) as { title?: string; description?: string };
			const title = body.title?.trim();

			if (!title) {
				return Response.json({ error: "Milestone title is required" }, { status: 400 });
			}

			// Check for duplicates
			const existingMilestones = await this.core.filesystem.listMilestones();
			const buildAliasKeys = (value: string): Set<string> => {
				const normalized = value.trim().toLowerCase();
				const keys = new Set<string>();
				if (!normalized) {
					return keys;
				}
				keys.add(normalized);
				if (/^\d+$/.test(normalized)) {
					const numeric = String(Number.parseInt(normalized, 10));
					keys.add(numeric);
					keys.add(`m-${numeric}`);
					return keys;
				}
				const match = normalized.match(/^m-(\d+)$/);
				if (match?.[1]) {
					const numeric = String(Number.parseInt(match[1], 10));
					keys.add(numeric);
					keys.add(`m-${numeric}`);
				}
				return keys;
			};
			const requestedKeys = buildAliasKeys(title);
			const duplicate = existingMilestones.find((milestone) => {
				const milestoneKeys = new Set<string>([...buildAliasKeys(milestone.id), ...buildAliasKeys(milestone.title)]);
				for (const key of requestedKeys) {
					if (milestoneKeys.has(key)) {
						return true;
					}
				}
				return false;
			});
			if (duplicate) {
				return Response.json({ error: "A milestone with this title or ID already exists" }, { status: 400 });
			}

			const milestone = await this.core.createMilestone(title, body.description);
			return Response.json(milestone, { status: 201 });
		} catch (error) {
			console.error("Error creating milestone:", error);
			return Response.json({ error: "Failed to create milestone" }, { status: 500 });
		}
	}

	private async handleArchiveMilestone(milestoneId: string): Promise<Response> {
		try {
			const result = await this.core.archiveMilestone(milestoneId);
			if (!result.success) {
				return Response.json({ error: "Milestone not found" }, { status: 404 });
			}
			this.broadcastTasksUpdated();
			return Response.json({ success: true, milestone: result.milestone ?? null });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to archive milestone";
			console.error("Error archiving milestone:", error);
			return Response.json({ error: message }, { status: 500 });
		}
	}

	private async handleGetVersion(): Promise<Response> {
		try {
			const version = await getVersion();
			return Response.json({ version });
		} catch (error) {
			console.error("Error getting version:", error);
			return Response.json({ error: "Failed to get version" }, { status: 500 });
		}
	}

	private async handleReorderTask(req: Request): Promise<Response> {
		try {
			const body = await req.json();
			const taskId = typeof body.taskId === "string" ? body.taskId : "";
			const targetStatus = typeof body.targetStatus === "string" ? body.targetStatus : "";
			const orderedTaskIds = Array.isArray(body.orderedTaskIds) ? body.orderedTaskIds : [];
			const targetMilestone =
				typeof body.targetMilestone === "string"
					? body.targetMilestone
					: body.targetMilestone === null
						? null
						: undefined;

			if (!taskId || !targetStatus || orderedTaskIds.length === 0) {
				return Response.json(
					{ error: "Missing required fields: taskId, targetStatus, and orderedTaskIds" },
					{ status: 400 },
				);
			}

			const { updatedTask } = await this.core.reorderTask({
				taskId,
				targetStatus,
				orderedTaskIds,
				targetMilestone,
				commitMessage: `Reorder tasks in ${targetStatus}`,
			});

			return Response.json({ success: true, task: updatedTask });
		} catch (error) {
			const message = error instanceof Error ? error.message : "Failed to reorder task";
			// Cross-branch and validation errors are client errors (400), not server errors (500)
			const isCrossBranchError = message.includes("exists in branch");
			const isValidationError = message.includes("not found") || message.includes("Missing required");
			const status = isCrossBranchError || isValidationError ? 400 : 500;
			if (status === 500) {
				console.error("Error reordering task:", error);
			}
			return Response.json({ error: message }, { status });
		}
	}

	private async handleCleanupPreview(req: Request): Promise<Response> {
		try {
			const url = new URL(req.url);
			const ageParam = url.searchParams.get("age");

			if (!ageParam) {
				return Response.json({ error: "Missing age parameter" }, { status: 400 });
			}

			const age = Number.parseInt(ageParam, 10);
			if (Number.isNaN(age) || age < 0) {
				return Response.json({ error: "Invalid age parameter" }, { status: 400 });
			}

			// Get Done tasks older than specified days
			const tasksToCleanup = await this.core.getDoneTasksByAge(age);

			// Return preview of tasks to be cleaned up
			const preview = tasksToCleanup.map((task) => ({
				id: task.id,
				title: task.title,
				updatedDate: task.updatedDate,
				createdDate: task.createdDate,
			}));

			return Response.json({
				count: preview.length,
				tasks: preview,
			});
		} catch (error) {
			console.error("Error getting cleanup preview:", error);
			return Response.json({ error: "Failed to get cleanup preview" }, { status: 500 });
		}
	}

	private async handleCleanupExecute(req: Request): Promise<Response> {
		try {
			const { age } = await req.json();

			if (age === undefined || age === null) {
				return Response.json({ error: "Missing age parameter" }, { status: 400 });
			}

			const ageInDays = Number.parseInt(age, 10);
			if (Number.isNaN(ageInDays) || ageInDays < 0) {
				return Response.json({ error: "Invalid age parameter" }, { status: 400 });
			}

			// Get Done tasks older than specified days
			const tasksToCleanup = await this.core.getDoneTasksByAge(ageInDays);

			if (tasksToCleanup.length === 0) {
				return Response.json({
					success: true,
					movedCount: 0,
					message: "No tasks to clean up",
				});
			}

			// Move tasks to completed folder
			let successCount = 0;
			const failedTasks: string[] = [];

			for (const task of tasksToCleanup) {
				try {
					const success = await this.core.completeTask(task.id);
					if (success) {
						successCount++;
					} else {
						failedTasks.push(task.id);
					}
				} catch (error) {
					console.error(`Failed to complete task ${task.id}:`, error);
					failedTasks.push(task.id);
				}
			}

			// Notify listeners to refresh
			this.broadcastTasksUpdated();

			return Response.json({
				success: true,
				movedCount: successCount,
				totalCount: tasksToCleanup.length,
				failedTasks: failedTasks.length > 0 ? failedTasks : undefined,
				message: `Moved ${successCount} of ${tasksToCleanup.length} tasks to completed folder`,
			});
		} catch (error) {
			console.error("Error executing cleanup:", error);
			return Response.json({ error: "Failed to execute cleanup" }, { status: 500 });
		}
	}

	// Sequences handlers
	private async handleGetSequences(): Promise<Response> {
		const data = await this.core.listActiveSequences();
		return Response.json(data);
	}

	private async handleMoveSequence(req: Request): Promise<Response> {
		try {
			const body = await req.json();
			const taskId = String(body.taskId || "").trim();
			const moveToUnsequenced = Boolean(body.unsequenced === true);
			const targetSequenceIndex = body.targetSequenceIndex !== undefined ? Number(body.targetSequenceIndex) : undefined;

			if (!taskId) return Response.json({ error: "taskId is required" }, { status: 400 });

			const next = await this.core.moveTaskInSequences({
				taskId,
				unsequenced: moveToUnsequenced,
				targetSequenceIndex,
			});
			return Response.json(next);
		} catch (error) {
			const message = (error as Error)?.message || "Invalid request";
			return Response.json({ error: message }, { status: 400 });
		}
	}

	private async handleGetStatistics(): Promise<Response> {
		try {
			// Load tasks using the same logic as CLI overview
			const { tasks, drafts, statuses } = await this.core.loadAllTasksForStatistics();

			// Calculate statistics using the exact same function as CLI
			const statistics = getTaskStatistics(tasks, drafts, statuses);

			// Convert Maps to objects for JSON serialization
			const response = {
				...statistics,
				statusCounts: Object.fromEntries(statistics.statusCounts),
				priorityCounts: Object.fromEntries(statistics.priorityCounts),
			};

			return Response.json(response);
		} catch (error) {
			console.error("Error getting statistics:", error);
			return Response.json({ error: "Failed to get statistics" }, { status: 500 });
		}
	}

	private async handleGetStatus(): Promise<Response> {
		try {
			const config = await this.core.filesystem.loadConfig();
			return Response.json({
				initialized: !!config,
				projectPath: this.core.filesystem.rootDir,
			});
		} catch (error) {
			console.error("Error getting status:", error);
			return Response.json({
				initialized: false,
				projectPath: this.core.filesystem.rootDir,
			});
		}
	}

	private async handleInit(req: Request): Promise<Response> {
		try {
			const body = await req.json();
			const projectName = typeof body.projectName === "string" ? body.projectName.trim() : "";
			const integrationMode = body.integrationMode as "mcp" | "cli" | "none" | undefined;
			const mcpClients = Array.isArray(body.mcpClients) ? body.mcpClients : [];
			const agentInstructions = Array.isArray(body.agentInstructions) ? body.agentInstructions : [];
			const installClaudeAgentFlag = Boolean(body.installClaudeAgent);
			const advancedConfig = body.advancedConfig || {};

			// Input validation (browser layer responsibility)
			if (!projectName) {
				return Response.json({ error: "Project name is required" }, { status: 400 });
			}

			// Check if already initialized (for browser, we don't allow re-init)
			const existingConfig = await this.core.filesystem.loadConfig();
			if (existingConfig) {
				return Response.json({ error: "Project is already initialized" }, { status: 400 });
			}

			// Call shared core init function
			const result = await initializeProject(this.core, {
				projectName,
				integrationMode: integrationMode || "none",
				mcpClients,
				agentInstructions,
				installClaudeAgent: installClaudeAgentFlag,
				advancedConfig,
				existingConfig: null,
			});

			// Update server's project name
			this.projectName = result.projectName;

			// Ensure config watcher is set up now that config file exists
			if (this.contentStore) {
				this.contentStore.ensureConfigWatcher();
			}

			return Response.json({
				success: result.success,
				projectName: result.projectName,
				mcpResults: result.mcpResults,
			});
		} catch (error) {
			console.error("Error initializing project:", error);
			const message = error instanceof Error ? error.message : "Failed to initialize project";
			return Response.json({ error: message }, { status: 500 });
		}
	}
}
