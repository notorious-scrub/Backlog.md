import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
	type AutomatedQaRunner,
	buildAutomatedQaCodexInvocation,
	buildAutomatedQaPrompt,
	drainAutomatedQaQueue,
	findNestedCodexDescendant,
	formatLocalTimestamp,
	loadAutomatedQaRuns,
	loadAutomatedQaState,
	normalizeAgentAutomationConfigs,
	normalizeAutomatedQaConfig,
	queueAutomatedQaTask,
	resetAutomatedQaActiveState,
	runAutomatedQaWithCodex,
	saveAutomatedQaState,
} from "../core/automated-qa.ts";
import { Core } from "../core/backlog.ts";
import { createUniqueTestDir, safeCleanup } from "./test-utils.ts";

let TEST_DIR: string;
let core: Core;

describe("automated QA orchestration", () => {
	it("uses a shell-backed Codex invocation on Windows for npm script shims", () => {
		const invocation = buildAutomatedQaCodexInvocation("codex", "C:\\DEV\\Example Project", "win32");
		expect(invocation.shell).toBe(true);
		expect(invocation.args).toEqual([]);
		expect(invocation.command).toContain("codex");
		expect(invocation.command).toContain(`"C:\\DEV\\Example Project"`);
		expect(invocation.command).toContain("--sandbox");
		expect(invocation.command).toContain("danger-full-access");
		expect(invocation.command).toContain("--config");
		expect(invocation.command).toContain("features.multi_agent=false");
	});

	it("includes a compact task snapshot and a direct shell-only QA workflow in the automated QA prompt", () => {
		const prompt = buildAutomatedQaPrompt(
			{
				id: "BACK-415",
				title: "Prompt enrichment",
				status: "QA",
				assignee: ["QA"],
				createdDate: "2026-04-03 22:00",
				labels: ["automation", "p1"],
				dependencies: [],
				description: "Validate that the automated QA prompt carries enough task context.",
				implementationNotes: "Implementation notes go here.",
				finalSummary: "Final summary goes here.",
				references: ["docs/plan.md"],
				documentation: ["docs/spec.md"],
				acceptanceCriteriaItems: [
					{ index: 1, text: "Prompt includes acceptance criteria", checked: true },
					{ index: 2, text: "Prompt includes labels", checked: false },
				],
				definitionOfDoneItems: [{ index: 1, text: "Run tests", checked: false }],
			},
			"qa_engineer",
			"QA",
		);

		expect(prompt).toContain('Review backlog task BACK-415 "Prompt enrichment"');
		expect(prompt).toContain("Task snapshot:");
		expect(prompt).toContain("Description:");
		expect(prompt).toContain("Acceptance Criteria:");
		expect(prompt).toContain("Definition of Done:");
		expect(prompt).toContain("Implementation Notes:");
		expect(prompt).toContain("Final Summary:");
		expect(prompt).toContain("References:");
		expect(prompt).toContain("Documentation:");
		expect(prompt).toContain("docs/spec.md");
		expect(prompt).toContain("Prompt includes labels");
		expect(prompt).toContain(
			'Reviewer identity hint: "qa_engineer". Perform the QA review directly in this run; do not spawn another Codex reviewer',
		);
		expect(prompt).toContain(
			"Delegation is forbidden. Do not call spawn_agent, codex exec, or any equivalent nested reviewer launch path.",
		);
		expect(prompt).toContain("Use shell commands only for this automated QA run.");
		expect(prompt).toContain("Do not use apply_patch or any direct file-editing tool");
		expect(prompt).toContain("Do not inspect Backlog.md source, .codex agent files");
		expect(prompt).toContain("Reach a status decision as soon as the evidence is sufficient");
		expect(prompt).toContain("Once you have written the backlog verdict and status update, stop immediately.");
		expect(prompt).toContain("Do not offer next steps, extra help, or additional review");
		expect(prompt).toContain("Use this exact Backlog.md CLI prefix");
		expect(prompt).toContain("task BACK-415 --plain");
		expect(prompt).toContain('task edit BACK-415 -s Done --append-notes "<qa summary>" --plain');
		expect(prompt).not.toContain("explicitly spawn it for the review");
	});

	it("formats automated QA activity timestamps in local machine time with offset", () => {
		const formatted = formatLocalTimestamp("2026-04-03T22:07:02.694Z");
		expect(formatted).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{3} [+-]\d{2}:\d{2}$/);
		expect(formatted.includes("Z")).toBe(false);
	});

	beforeEach(async () => {
		TEST_DIR = createUniqueTestDir("automated-qa");
		core = new Core(TEST_DIR);
		await core.filesystem.ensureBacklogStructure();
		await core.filesystem.saveConfig({
			projectName: "Automated QA",
			statuses: ["To Do", "QA", "Done"],
			labels: [],
			dateFormat: "yyyy-mm-dd",
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
	});

	afterEach(async () => {
		await safeCleanup(TEST_DIR);
	});

	it("queues a task when automated QA is paused and the task moves into the trigger status", async () => {
		const { task } = await core.createTaskFromInput({
			title: "Queue me",
			status: "To Do",
		});

		await core.updateTaskFromInput(task.id, { status: "QA" });

		const state = await loadAutomatedQaState(TEST_DIR);
		const runs = await loadAutomatedQaRuns(TEST_DIR);
		expect(state.queuedTaskIds).toEqual([task.id]);
		expect(state.activeTaskIds).toEqual([]);
		expect(runs).toHaveLength(1);
		expect(runs[0]?.taskId).toBe(task.id);
		expect(runs[0]?.status).toBe("queued");
		expect(runs[0]?.phase).toBe("queued");
		expect(runs[0]?.lastHeartbeatNote).toBe("Queued for automated QA");
	});

	it("does not queue the same task twice", async () => {
		const { task } = await core.createTaskFromInput({
			title: "Only once",
			status: "QA",
		});

		await queueAutomatedQaTask(TEST_DIR, task.id);
		await queueAutomatedQaTask(TEST_DIR, task.id);

		const state = await loadAutomatedQaState(TEST_DIR);
		expect(state.queuedTaskIds).toEqual([task.id]);
	});

	it("queues label-triggered automations with durable automation metadata and dedupes repeat updates", async () => {
		await core.filesystem.saveConfig({
			projectName: "Automated QA",
			statuses: ["To Do", "In Progress", "QA", "Done"],
			labels: ["needs-qa"],
			dateFormat: "yyyy-mm-dd",
			agentAutomations: [
				{
					id: "docs-review",
					name: "Docs Review",
					enabled: true,
					paused: true,
					trigger: {
						type: "label_added",
						toStatus: "In Progress",
						addedLabelsAny: ["needs-qa"],
					},
					codexCommand: "codex",
					agentName: "docs_checker",
					reviewerAssignee: "Docs QA",
					timeoutSeconds: 120,
					maxConcurrentRuns: 2,
					promptTemplate: "Review docs only.",
				},
			],
		});

		const { task } = await core.createTaskFromInput({
			title: "Needs docs QA",
			status: "In Progress",
		});

		await core.updateTaskFromInput(task.id, { addLabels: ["needs-qa"] });
		await core.updateTaskFromInput(task.id, { appendImplementationNotes: ["A note that should not requeue."] });

		const state = await loadAutomatedQaState(TEST_DIR);
		const runs = await loadAutomatedQaRuns(TEST_DIR);
		expect(state.queuedTaskIds).toEqual([task.id]);
		expect(state.queuedRuns).toHaveLength(1);
		expect(state.queuedRuns?.[0]?.automationId).toBe("docs-review");
		expect(state.queuedRuns?.[0]?.automationName).toBe("Docs Review");
		expect(state.queuedRuns?.[0]?.triggerType).toBe("label_added");
		expect(state.queuedRuns?.[0]?.triggerSignature).toContain("labels:needs-qa");
		expect(runs).toHaveLength(1);
		expect(runs[0]?.automationId).toBe("docs-review");
		expect(runs[0]?.automationName).toBe("Docs Review");
		expect(runs[0]?.triggerType).toBe("label_added");
		expect(runs[0]?.triggerSignature).toContain("labels:needs-qa");
		expect(runs[0]?.queueEntryId).toBe(state.queuedRuns?.[0]?.id);
	});

	it("honors a per-automation max concurrency cap before starting another run", async () => {
		await core.filesystem.saveConfig({
			projectName: "Automated QA",
			statuses: ["To Do", "QA", "Done"],
			labels: [],
			dateFormat: "yyyy-mm-dd",
			agentAutomations: [
				{
					id: "qa-review",
					name: "QA Review",
					enabled: true,
					paused: false,
					trigger: {
						type: "status_transition",
						toStatus: "QA",
					},
					codexCommand: "codex",
					agentName: "qa_engineer",
					reviewerAssignee: "QA",
					timeoutSeconds: 180,
					maxConcurrentRuns: 1,
				},
			],
		});

		const first = await core.createTaskFromInput({
			title: "First QA task",
			status: "QA",
		});
		const second = await core.createTaskFromInput({
			title: "Second QA task",
			status: "QA",
		});
		const config = await core.filesystem.loadConfig();
		const [automation] = normalizeAgentAutomationConfigs(config?.agentAutomations, config?.automatedQa);
		if (!automation) {
			throw new Error("Expected a normalized automation config");
		}
		await queueAutomatedQaTask(TEST_DIR, first.task.id, automation);
		await queueAutomatedQaTask(TEST_DIR, second.task.id, automation);
		const queuedState = await loadAutomatedQaState(TEST_DIR);
		const [activeRun, ...queuedRuns] = queuedState.queuedRuns ?? [];
		await saveAutomatedQaState(TEST_DIR, {
			...queuedState,
			activeRuns: activeRun ? [activeRun] : [],
			queuedRuns,
		});

		let runnerCalls = 0;
		const runner: AutomatedQaRunner = async () => {
			runnerCalls += 1;
			return { success: true, exitCode: 0 };
		};

		const result = await drainAutomatedQaQueue(core, { runner });
		expect(result.processedTaskIds).toEqual([]);
		expect(runnerCalls).toBe(0);

		const finalState = await loadAutomatedQaState(TEST_DIR);
		expect(finalState.activeTaskIds).toEqual([first.task.id]);
		expect(finalState.queuedTaskIds).toEqual([second.task.id]);
	});

	it("drains queued tasks and clears active state after a successful QA runner", async () => {
		await core.filesystem.saveConfig({
			projectName: "Automated QA",
			statuses: ["To Do", "QA", "Done"],
			labels: [],
			dateFormat: "yyyy-mm-dd",
			automatedQa: {
				enabled: true,
				paused: false,
				triggerStatus: "QA",
				codexCommand: "codex",
				agentName: "qa_engineer",
				reviewerAssignee: "QA",
				timeoutSeconds: 420,
			},
		});

		const { task } = await core.createTaskFromInput({
			title: "Drain me",
			status: "QA",
			description: "Task description for QA context.",
			labels: ["automation", "backend"],
			references: ["docs/plan.md"],
			documentation: ["docs/spec.md"],
			acceptanceCriteria: [{ text: "Task has acceptance criteria", checked: false }],
			definitionOfDoneAdd: ["Run tests"],
		});
		await core.updateTaskFromInput(task.id, {
			appendImplementationNotes: ["Implementation notes for QA context."],
			finalSummary: "Final summary for QA context.",
		});
		await queueAutomatedQaTask(TEST_DIR, task.id);

		let receivedPrompt = "";
		const runner: AutomatedQaRunner = async ({
			taskId,
			prompt,
			timeoutSeconds,
			onProcessStarted,
			onHeartbeat,
			onOutput,
		}) => {
			receivedPrompt = prompt;
			expect(timeoutSeconds).toBe(420);
			await onProcessStarted?.({
				pid: 4242,
				startedAt: "2026-04-03T22:10:00.000Z",
				command: "codex",
				args: ["exec"],
			});
			await onHeartbeat?.({
				timestamp: "2026-04-03T22:10:15.000Z",
				phase: "reviewer_running",
				note: "Reviewer process is still running",
			});
			await onOutput?.({
				timestamp: "2026-04-03T22:10:20.000Z",
				source: "stdout",
				chunk: '{"id":"0","msg":{"type":"agent_message","message":"QA output"}}\n',
			});
			await onOutput?.({
				timestamp: "2026-04-03T22:10:21.000Z",
				source: "stderr",
				chunk: "stderr line from automated qa\n",
			});
			await core.updateTaskFromInput(taskId, { status: "Done" });
			return {
				success: true,
				exitCode: 0,
				stdoutExcerpt: '{"id":"0","msg":{"type":"agent_message","message":"QA output"}}',
				stderrExcerpt: "stderr line from automated qa",
				lastOutputAt: "2026-04-03T22:10:21.000Z",
				lastOutputSource: "stderr",
				lastOutputExcerpt: "stderr line from automated qa",
			};
		};

		const result = await drainAutomatedQaQueue(core, { runner });
		expect(result.processedTaskIds).toEqual([task.id]);

		const state = await loadAutomatedQaState(TEST_DIR);
		const runs = await loadAutomatedQaRuns(TEST_DIR);
		expect(state.queuedTaskIds).toEqual([]);
		expect(state.activeTaskIds).toEqual([]);
		expect(state.lastCompletedTaskId).toBe(task.id);
		expect(runs).toHaveLength(1);
		expect(runs[0]?.status).toBe("succeeded");
		expect(runs[0]?.phase).toBe("reviewer_completed");
		expect(runs[0]?.startedAt).toBeTruthy();
		expect(runs[0]?.completedAt).toBeTruthy();
		expect(runs[0]?.lastHeartbeatAt).toBeTruthy();
		expect(runs[0]?.lastHeartbeatNote).toBe("Reviewer process completed successfully");
		expect(runs[0]?.finalTaskStatus).toBe("Done");
		expect(runs[0]?.stdoutExcerpt).toContain("QA output");
		expect(runs[0]?.stderrExcerpt).toContain("stderr line from automated qa");
		expect(runs[0]?.lastOutputAt).toBe("2026-04-03T22:10:21.000Z");
		expect(runs[0]?.lastOutputSource).toBe("stderr");
		expect(runs[0]?.lastOutputExcerpt).toContain("stderr line from automated qa");

		const updatedTask = await core.getTask(task.id);
		expect(updatedTask?.status).toBe("Done");
		expect(updatedTask?.assignee).toEqual(["QA"]);
		expect(receivedPrompt).toContain("Task snapshot:");
		expect(receivedPrompt).toContain("Task description for QA context.");
		expect(receivedPrompt).toContain("docs/spec.md");
		expect(updatedTask?.implementationNotes).toContain("Automated QA review started at");
		expect(updatedTask?.implementationNotes).toContain(
			`Automated QA reviewer process launched at ${formatLocalTimestamp("2026-04-03T22:10:00.000Z")}`,
		);
		expect(updatedTask?.implementationNotes).toContain("Automated QA review completed at");

		const auditEvents = await core.filesystem.listTaskAuditEvents({ taskId: task.id, limit: 50 });
		const auditEventTypes = auditEvents.events.map((event) => event.eventType);
		expect(auditEventTypes).toContain("automation_run_queued");
		expect(auditEventTypes).toContain("automation_run_dequeued");
		expect(auditEventTypes).toContain("automation_task_claimed");
		expect(auditEventTypes).toContain("automation_reviewer_launching");
		expect(auditEventTypes).toContain("automation_reviewer_started");
		expect(auditEventTypes).toContain("automation_reviewer_output");
		expect(auditEventTypes).toContain("automation_run_succeeded");
		const claimEvent = auditEvents.events.find((event) => event.eventType === "automation_task_claimed");
		expect(claimEvent?.actor.kind).toBe("automation");
		expect(claimEvent?.actor.source).toBe("automation-worker");
		expect(claimEvent?.actor.automationId).toBe("automated-qa");
		expect(claimEvent?.data).toMatchObject({
			automationId: "automated-qa",
			triggerType: "status_transition",
			triggerStatus: "QA",
			reviewerAssignee: "QA",
		});
	});

	it("reconciles reviewer-authored status changes from disk before stale-QA fail-close checks", async () => {
		await core.filesystem.saveConfig({
			projectName: "Automated QA",
			statuses: ["To Do", "In Progress", "QA", "Done", "Blocked"],
			labels: [],
			dateFormat: "yyyy-mm-dd",
			automatedQa: {
				enabled: true,
				paused: false,
				triggerStatus: "QA",
				codexCommand: "codex",
				agentName: "qa_engineer",
				reviewerAssignee: "QA",
				timeoutSeconds: 420,
			},
		});

		const { task } = await core.createTaskFromInput({
			title: "Refresh terminal task state",
			status: "QA",
		});
		await queueAutomatedQaTask(TEST_DIR, task.id);

		const runner: AutomatedQaRunner = async ({ taskId }) => {
			const fileTask = await core.filesystem.loadTask(taskId);
			if (!fileTask) {
				throw new Error("Expected queued task to exist on disk");
			}
			fileTask.status = "In Progress";
			fileTask.assignee = ["QA"];
			fileTask.implementationNotes = `${fileTask.implementationNotes ?? ""}\n\nQA review failed from external reviewer.`;
			await core.filesystem.saveTask(fileTask);
			return {
				success: true,
				exitCode: 0,
			};
		};

		const result = await drainAutomatedQaQueue(core, { runner });
		expect(result.processedTaskIds).toEqual([task.id]);

		const state = await loadAutomatedQaState(TEST_DIR);
		const runs = await loadAutomatedQaRuns(TEST_DIR);
		const config = await core.filesystem.loadConfig();
		expect(state.queuedTaskIds).toEqual([]);
		expect(state.activeTaskIds).toEqual([]);
		expect(state.lastError).toBeUndefined();
		expect(config?.automatedQa?.paused).toBe(false);
		expect(runs[0]?.status).toBe("succeeded");
		expect(runs[0]?.phase).toBe("reviewer_completed");
		expect(runs[0]?.finalTaskStatus).toBe("In Progress");

		const updatedTask = await core.filesystem.loadTask(task.id);
		expect(updatedTask?.status).toBe("In Progress");
		expect(updatedTask?.assignee).toEqual(["QA"]);
		expect(updatedTask?.implementationNotes).toContain("QA review failed from external reviewer.");
		expect(updatedTask?.implementationNotes).toContain("Final task status: In Progress.");

		const auditEvents = await core.filesystem.listTaskAuditEvents({ taskId: task.id, limit: 50 });
		const auditEventTypes = auditEvents.events.map((event) => event.eventType);
		expect(auditEventTypes).toContain("automation_run_succeeded");
		expect(auditEventTypes).not.toContain("automation_run_failed");
		expect(auditEventTypes).not.toContain("automation_queue_paused");
	});

	it("sweeps existing trigger-status tasks into the queue and claims them with the reviewer assignee", async () => {
		await core.filesystem.saveConfig({
			projectName: "Automated QA",
			statuses: ["To Do", "QA", "Done"],
			labels: [],
			dateFormat: "yyyy-mm-dd",
			automatedQa: {
				enabled: true,
				paused: false,
				triggerStatus: "QA",
				codexCommand: "codex",
				agentName: "qa_engineer",
				reviewerAssignee: "QA",
				timeoutSeconds: 180,
			},
		});

		const { task } = await core.createTaskFromInput({
			title: "Already in QA",
			status: "QA",
			assignee: ["Codex"],
		});

		const runner: AutomatedQaRunner = async ({ taskId }) => {
			const claimedTask = await core.getTask(taskId);
			expect(claimedTask?.assignee).toEqual(["QA"]);
			await core.updateTaskFromInput(taskId, { status: "Done" });
			return { success: true, exitCode: 0 };
		};

		const result = await drainAutomatedQaQueue(core, { runner });
		expect(result.processedTaskIds).toEqual([task.id]);

		const state = await loadAutomatedQaState(TEST_DIR);
		const runs = await loadAutomatedQaRuns(TEST_DIR);
		expect(state.queuedTaskIds).toEqual([]);
		expect(state.activeTaskIds).toEqual([]);
		expect(runs).toHaveLength(1);
		expect(runs[0]?.status).toBe("succeeded");
		expect(runs[0]?.phase).toBe("reviewer_completed");
		expect(runs[0]?.codexPid).toBeUndefined();

		const updatedTask = await core.getTask(task.id);
		expect(updatedTask?.status).toBe("Done");
		expect(updatedTask?.assignee).toEqual(["QA"]);
	});

	it("pauses automated QA and does not requeue a task when Codex exits zero after a usage-limit error", async () => {
		await core.filesystem.saveConfig({
			projectName: "Automated QA",
			statuses: ["To Do", "QA", "Done"],
			labels: [],
			dateFormat: "yyyy-mm-dd",
			automatedQa: {
				enabled: true,
				paused: false,
				triggerStatus: "QA",
				codexCommand: "codex",
				agentName: "qa_engineer",
				reviewerAssignee: "QA",
				timeoutSeconds: 420,
			},
		});

		const { task } = await core.createTaskFromInput({
			title: "Quota storm guard",
			status: "QA",
		});

		let runnerCalls = 0;
		const runner: AutomatedQaRunner = async () => {
			runnerCalls += 1;
			return {
				success: true,
				exitCode: 0,
				stdoutExcerpt: "[2026-04-03T23:47:18] ERROR: You've hit your usage limit. Upgrade to Pro or try again later.",
				lastOutputSource: "stdout",
				lastOutputExcerpt:
					"[2026-04-03T23:47:18] ERROR: You've hit your usage limit. Upgrade to Pro or try again later.",
			};
		};

		const result = await drainAutomatedQaQueue(core, { runner });
		expect(result.processedTaskIds).toEqual([]);
		expect(runnerCalls).toBe(1);

		const state = await loadAutomatedQaState(TEST_DIR);
		const runs = await loadAutomatedQaRuns(TEST_DIR);
		const config = await core.filesystem.loadConfig();
		expect(state.queuedTaskIds).toEqual([]);
		expect(state.activeTaskIds).toEqual([]);
		expect(state.lastCompletedTaskId).toBe(task.id);
		expect(state.lastError).toContain("usage/rate-limit");
		expect(config?.automatedQa?.paused).toBe(true);
		expect(runs).toHaveLength(1);
		expect(runs[0]?.status).toBe("failed");
		expect(runs[0]?.phase).toBe("reviewer_failed");
		expect(runs[0]?.error).toContain("usage/rate-limit");
		expect(runs[0]?.finalTaskStatus).toBe("QA");

		const updatedTask = await core.getTask(task.id);
		expect(updatedTask?.status).toBe("QA");
		expect(updatedTask?.implementationNotes).toContain("Automated QA review attempt failed");
		expect(updatedTask?.implementationNotes).toContain("usage/rate-limit");
	});

	it("blocks nested shell-launched codex commands inside automated QA reviewer runs", async () => {
		const binDir = join(TEST_DIR, "bin");
		await mkdir(binDir, { recursive: true });
		const fakeCodexPath = process.platform === "win32" ? join(binDir, "codex.cmd") : join(binDir, "codex");
		const fakeCodexScript =
			process.platform === "win32"
				? "@echo off\r\ncodex exec nested-reviewer\r\nexit /b %ERRORLEVEL%\r\n"
				: "#!/usr/bin/env sh\ncodex exec nested-reviewer\nexit $?\n";
		await writeFile(fakeCodexPath, fakeCodexScript, {
			encoding: "utf8",
			mode: process.platform === "win32" ? undefined : 0o755,
		});

		const result = await runAutomatedQaWithCodex({
			projectRoot: TEST_DIR,
			taskId: "BACK-999",
			prompt: "Trigger a nested codex launch",
			codexCommand: fakeCodexPath,
			timeoutSeconds: 30,
		});

		expect(result.success).toBe(false);
		expect(result.exitCode).not.toBe(0);
		expect(result.stderrExcerpt).toContain(
			"Nested Codex launches are disabled during Backlog automated QA reviewer runs.",
		);
		expect(result.lastOutputExcerpt).toContain(
			"Nested Codex launches are disabled during Backlog automated QA reviewer runs.",
		);
	});

	it("detects nested absolute-path codex descendants from reviewer process snapshots", () => {
		const nestedDescendant = findNestedCodexDescendant(100, [
			{
				pid: 200,
				parentPid: 100,
				name: "cmd.exe",
				commandLine: 'cmd.exe /c "C:\\Tools\\codex.cmd"',
			},
			{
				pid: 300,
				parentPid: 100,
				name: "powershell.exe",
				commandLine: 'powershell -NoProfile -File "C:\\Tools\\codex.ps1"',
			},
		]);

		expect(nestedDescendant).not.toBeNull();
		expect(nestedDescendant?.pid).toBe(200);
		expect(nestedDescendant?.commandLine).toContain("codex.cmd");
	});

	it("pauses automated QA and does not requeue a task when the nested Codex guard blocks a reviewer command", async () => {
		await core.filesystem.saveConfig({
			projectName: "Automated QA",
			statuses: ["To Do", "QA", "Done"],
			labels: [],
			dateFormat: "yyyy-mm-dd",
			automatedQa: {
				enabled: true,
				paused: false,
				triggerStatus: "QA",
				codexCommand: "codex",
				agentName: "qa_engineer",
				reviewerAssignee: "QA",
				timeoutSeconds: 420,
			},
		});

		const { task } = await core.createTaskFromInput({
			title: "Nested guard retry",
			status: "QA",
		});

		let runnerCalls = 0;
		const runner: AutomatedQaRunner = async () => {
			runnerCalls += 1;
			return {
				success: false,
				exitCode: 1,
				stderrExcerpt: "ERROR: Nested Codex launches are disabled during Backlog automated QA reviewer runs.",
				lastOutputSource: "stderr",
				lastOutputExcerpt: "ERROR: Nested Codex launches are disabled during Backlog automated QA reviewer runs.",
				error: "ERROR: Nested Codex launches are disabled during Backlog automated QA reviewer runs.",
			};
		};

		const result = await drainAutomatedQaQueue(core, { runner });
		expect(result.processedTaskIds).toEqual([]);
		expect(runnerCalls).toBe(1);

		const state = await loadAutomatedQaState(TEST_DIR);
		const runs = await loadAutomatedQaRuns(TEST_DIR);
		const config = await core.filesystem.loadConfig();
		expect(state.queuedTaskIds).toEqual([]);
		expect(state.activeTaskIds).toEqual([]);
		expect(state.lastCompletedTaskId).toBe(task.id);
		expect(state.lastError).toContain("nested Codex launch blocked");
		expect(config?.automatedQa?.paused).toBe(true);
		expect(runs).toHaveLength(1);
		expect(runs[0]?.status).toBe("failed");
		expect(runs[0]?.phase).toBe("reviewer_failed");
		expect(runs[0]?.error).toContain("nested Codex launch blocked");
		expect(runs[0]?.finalTaskStatus).toBe("QA");

		const updatedTask = await core.getTask(task.id);
		expect(updatedTask?.status).toBe("QA");
		expect(updatedTask?.implementationNotes).toContain("Automated QA review attempt failed");
		expect(updatedTask?.implementationNotes).toContain("nested Codex launch blocked");
	});

	it("clears stale active task state before a fresh worker drain", async () => {
		await core.filesystem.saveConfig({
			projectName: "Automated QA",
			statuses: ["To Do", "QA", "Done"],
			labels: [],
			dateFormat: "yyyy-mm-dd",
			automatedQa: {
				enabled: true,
				paused: false,
				triggerStatus: "QA",
				codexCommand: "codex",
				agentName: "qa_engineer",
				reviewerAssignee: "QA",
				timeoutSeconds: 180,
			},
		});

		const { task } = await core.createTaskFromInput({
			title: "Stale active state",
			status: "QA",
		});
		const config = await core.filesystem.loadConfig();
		await queueAutomatedQaTask(TEST_DIR, task.id, normalizeAutomatedQaConfig(config?.automatedQa));

		await saveAutomatedQaState(TEST_DIR, {
			queuedTaskIds: [],
			activeTaskIds: [task.id],
		});
		await resetAutomatedQaActiveState(TEST_DIR);

		const runner: AutomatedQaRunner = async ({ taskId }) => {
			await core.updateTaskFromInput(taskId, { status: "Done" });
			return { success: true, exitCode: 0 };
		};

		const result = await drainAutomatedQaQueue(core, { runner });
		expect(result.processedTaskIds).toEqual([task.id]);

		const state = await loadAutomatedQaState(TEST_DIR);
		const runs = await loadAutomatedQaRuns(TEST_DIR);
		expect(state.activeTaskIds).toEqual([]);
		expect(state.queuedTaskIds).toEqual([]);
		expect(runs).toHaveLength(2);
		expect(runs[0]?.status).toBe("abandoned");
		expect(runs[0]?.phase).toBe("abandoned");
		expect(runs[0]?.error).toContain("Previous automated QA worker ended");
		expect(runs[1]?.status).toBe("succeeded");
		expect(runs[1]?.phase).toBe("reviewer_completed");
	});
});
