import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { FileSystem } from "../file-system/operations.ts";
import { BacklogServer } from "../server/index.ts";
import type { BacklogConfig, Task, TaskAuditEventPage } from "../types/index.ts";
import { createUniqueTestDir, retry, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
let filesystem: FileSystem;
let server: BacklogServer | null = null;
let serverPort = 0;

describe("BacklogServer config endpoint", () => {
	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("server-config");
		filesystem = new FileSystem(TEST_DIR);
		await filesystem.ensureBacklogStructure();
		await filesystem.saveConfig({
			projectName: "Server Config",
			statuses: ["To Do", "QA", "Done"],
			labels: ["docs"],
			definitionOfDone: ["Run tests"],
			dateFormat: "YYYY-MM-DD",
			remoteOperations: false,
			automatedQa: {
				enabled: true,
				paused: true,
				triggerStatus: "QA",
				codexCommand: "codex",
				agentName: "qa_engineer",
				reviewerAssignee: "QA",
				timeoutSeconds: 180,
			},
		});

		server = new BacklogServer(TEST_DIR);
		await server.start(0, false);
		const port = server.getPort();
		expect(port).not.toBeNull();
		serverPort = port ?? 0;
		expect(serverPort).toBeGreaterThan(0);

		await retry(
			async () => {
				const config = await fetchJson<BacklogConfig>("/api/config");
				expect(config.projectName).toBe("Server Config");
				return config;
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

	it("preserves Definition of Done defaults when config is updated through the API", async () => {
		const current = await fetchJson<BacklogConfig>("/api/config");
		expect(current.definitionOfDone).toEqual(["Run tests"]);

		const updatedConfig: BacklogConfig = {
			...current,
			labels: ["docs", "backend", "bug"],
			definitionOfDone: ["Run tests", "Update docs", "Record QA sign-off"],
			defaultPort: 7007,
		};

		const putResponse = await fetch(`http://127.0.0.1:${serverPort}/api/config`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(updatedConfig),
		});
		expect(putResponse.status).toBe(200);

		const putPayload = (await putResponse.json()) as BacklogConfig;
		expect(putPayload.definitionOfDone).toEqual(updatedConfig.definitionOfDone);

		const reloaded = await retry(
			async () => {
				const config = await fetchJson<BacklogConfig>("/api/config");
				expect(config.labels).toEqual(["docs", "backend", "bug"]);
				expect(config.definitionOfDone).toEqual(["Run tests", "Update docs", "Record QA sign-off"]);
				expect(config.defaultPort).toBe(7007);
				return config;
			},
			10,
			50,
		);
		expect(reloaded.labels).toEqual(["docs", "backend", "bug"]);
		expect(reloaded.definitionOfDone).toEqual(["Run tests", "Update docs", "Record QA sign-off"]);
		expect(reloaded.defaultPort).toBe(7007);

		const savedConfig = await new FileSystem(TEST_DIR).loadConfig();
		expect(savedConfig?.definitionOfDone).toEqual(["Run tests", "Update docs", "Record QA sign-off"]);
		expect(savedConfig?.labels).toEqual(["docs", "backend", "bug"]);
		expect(savedConfig?.defaultPort).toBe(7007);
	});

	it("returns automated QA state and persists automated QA config updates", async () => {
		const current = await fetchJson<BacklogConfig>("/api/config");
		expect(current.automatedQa?.enabled).toBe(true);
		expect(current.automatedQa?.paused).toBe(true);

		const updatedConfig: BacklogConfig = {
			...current,
			automatedQa: {
				enabled: true,
				paused: false,
				triggerStatus: "QA",
				codexCommand: "codex",
				agentName: "qa_engineer",
				reviewerAssignee: "QA",
				timeoutSeconds: 420,
			},
		};

		const putResponse = await fetch(`http://127.0.0.1:${serverPort}/api/config`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(updatedConfig),
		});
		expect(putResponse.status).toBe(200);

		const automatedQaPayload = await retry(
			async () => {
				const payload = await fetchJson<{
					config: NonNullable<BacklogConfig["automatedQa"]>;
					state: { queuedTaskIds: string[]; activeTaskIds: string[] };
					recentRuns: Array<{ taskId: string }>;
				}>("/api/automated-qa");
				expect(payload.config.enabled).toBe(true);
				expect(payload.config.paused).toBe(false);
				expect(payload.config.triggerStatus).toBe("QA");
				expect(payload.config.reviewerAssignee).toBe("QA");
				expect(payload.config.timeoutSeconds).toBe(420);
				expect(payload.state.queuedTaskIds).toEqual([]);
				expect(payload.state.activeTaskIds).toEqual([]);
				expect(payload.recentRuns).toEqual([]);
				return payload;
			},
			10,
			50,
		);
		expect(automatedQaPayload.config.enabled).toBe(true);
	});

	it("persists generalized agent automation config and exposes normalized automation metadata", async () => {
		const current = await fetchJson<BacklogConfig>("/api/config");
		const updatedConfig: BacklogConfig = {
			...current,
			agentAutomations: [
				{
					id: "automated-qa",
					name: "Automated QA",
					enabled: true,
					paused: false,
					trigger: {
						type: "status_transition",
						toStatus: "QA",
						labelsAny: ["docs"],
					},
					codexCommand: "codex",
					agentName: "qa_engineer",
					reviewerAssignee: "QA",
					timeoutSeconds: 300,
					maxConcurrentRuns: 2,
					promptTemplate: "Focus on documentation acceptance criteria.",
				},
				{
					id: "docs-review",
					name: "Docs Review",
					enabled: true,
					paused: true,
					trigger: {
						type: "label_added",
						toStatus: "QA",
						addedLabelsAny: ["docs"],
					},
					codexCommand: "codex",
					agentName: "docs_checker",
					reviewerAssignee: "Docs QA",
					timeoutSeconds: 180,
					maxConcurrentRuns: 1,
				},
			],
		};

		const putResponse = await fetch(`http://127.0.0.1:${serverPort}/api/config`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify(updatedConfig),
		});
		expect(putResponse.status).toBe(200);

		const reloadedConfig = await retry(
			async () => {
				const config = await fetchJson<BacklogConfig>("/api/config");
				expect(config.agentAutomations).toHaveLength(2);
				return config;
			},
			10,
			50,
		);
		expect(reloadedConfig.agentAutomations).toHaveLength(2);
		expect(reloadedConfig.agentAutomations?.[0]?.trigger?.labelsAny).toEqual(["docs"]);
		expect(reloadedConfig.agentAutomations?.[1]?.trigger?.type).toBe("label_added");
		expect(reloadedConfig.agentAutomations?.[1]?.reviewerAssignee).toBe("Docs QA");

		const automationPayload = await fetchJson<{
			automations: NonNullable<BacklogConfig["agentAutomations"]>;
		}>("/api/automated-qa");
		expect(automationPayload.automations).toHaveLength(2);
		expect(automationPayload.automations[0]?.id).toBe("automated-qa");
		expect(automationPayload.automations[0]?.maxConcurrentRuns).toBe(2);
		expect(automationPayload.automations[0]?.promptTemplate).toContain("documentation acceptance criteria");
		expect(automationPayload.automations[1]?.id).toBe("docs-review");
		expect(automationPayload.automations[1]?.trigger?.type).toBe("label_added");
	});

	it("serves task and automation audit log timelines with filterable newest-first event pages", async () => {
		const createResponse = await fetch(`http://127.0.0.1:${serverPort}/api/tasks`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				title: "Audit endpoint task",
				status: "To Do",
			}),
		});
		expect(createResponse.status).toBe(201);
		const createdTask = (await createResponse.json()) as Task;

		const updateResponse = await fetch(`http://127.0.0.1:${serverPort}/api/tasks/${createdTask.id}`, {
			method: "PUT",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				status: "QA",
				assignee: ["@Codex"],
			}),
		});
		expect(updateResponse.status).toBe(200);

		const taskAuditPage = await retry(
			async () => {
				const page = await fetchJson<TaskAuditEventPage>(`/api/tasks/${createdTask.id}/audit-log?limit=20`);
				expect(page.events.length).toBeGreaterThan(0);
				return page;
			},
			10,
			50,
		);
		const statusEvent = taskAuditPage.events.find((event) => event.eventType === "task_status_changed");
		expect(statusEvent?.actor.source).toBe("web");
		expect(statusEvent?.data).toMatchObject({
			previousStatus: "To Do",
			nextStatus: "QA",
		});

		await filesystem.appendTaskAuditEvent({
			id: "evt-test-automation",
			taskId: createdTask.id,
			eventType: "automation_run_queued",
			occurredAt: "2026-04-04T20:00:00.000Z",
			actor: {
				kind: "automation",
				source: "automation-worker",
				automationId: "automated-qa",
				automationName: "Automated QA",
				queueEntryId: "automated-qa::queue",
				runId: "automated-qa::queue",
				agentName: "qa_engineer",
				processId: 1234,
			},
			summary: "Queued automated QA",
			data: {
				automationId: "automated-qa",
				triggerType: "status_transition",
				triggerStatus: "QA",
				triggerSignature: "to:QA",
			},
		});

		const automationAuditPage = await fetchJson<TaskAuditEventPage>(
			`/api/agent-automations/audit-log?taskId=${encodeURIComponent(createdTask.id)}&automationId=automated-qa&eventType=automation_run_queued&limit=10`,
		);
		const manualEvent = automationAuditPage.events.find((event) => event.id === "evt-test-automation");
		expect(automationAuditPage.events.length).toBeGreaterThanOrEqual(1);
		expect(manualEvent?.eventType).toBe("automation_run_queued");
		expect(manualEvent?.actor.automationId).toBe("automated-qa");
		expect(manualEvent?.summary).toBe("Queued automated QA");
	});
});

async function fetchJson<T>(path: string): Promise<T> {
	const response = await fetch(`http://127.0.0.1:${serverPort}${path}`);
	if (!response.ok) {
		throw new Error(`Request failed: ${response.status}`);
	}
	return response.json();
}
