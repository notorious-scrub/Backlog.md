import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, open, readFile, rm, writeFile } from "node:fs/promises";
import { basename, delimiter, isAbsolute, join, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { FileSystem } from "../file-system/operations.ts";
import type {
	AgentAutomationConfig,
	AgentAutomationQueueItem,
	AgentAutomationTriggerConfig,
	AgentAutomationTriggerType,
	AutomatedQaConfig,
	AutomatedQaRunPhase,
	AutomatedQaRunRecord,
	AutomatedQaRunStatus,
	AutomatedQaState,
	BacklogConfig,
	Task,
	TaskAuditActor,
	TaskAuditEvent,
	TaskAuditEventType,
} from "../types/index.ts";
import type { Core } from "./backlog.ts";

const DEFAULT_TRIGGER_STATUS = "QA";
const DEFAULT_CODEX_COMMAND = "codex";
const DEFAULT_AGENT_NAME = "qa_engineer";
const DEFAULT_REVIEWER_ASSIGNEE = "QA";
const DEFAULT_TIMEOUT_SECONDS = 180;
const DEFAULT_AUTOMATION_ID = "automated-qa";
const DEFAULT_AUTOMATION_NAME = "Automated QA";
const DEFAULT_MAX_CONCURRENT_RUNS = 1;
const STATE_FILENAME = "automated-qa-state.json";
const RUNS_FILENAME = "automated-qa-runs.json";
const LOCK_FILENAME = "automated-qa-worker.lock";
const NESTED_CODEX_GUARD_DIRNAME = ".automated-qa-codex-guard";
const AUTOMATED_QA_READ_RETRY_DELAYS_MS = [20, 50, 100];
const automatedQaMutationQueues = new Map<string, Promise<void>>();

export interface NormalizedAutomatedQaConfig {
	id: string;
	name: string;
	enabled: boolean;
	paused: boolean;
	triggerType: AgentAutomationTriggerType;
	triggerStatus: string;
	fromStatus?: string;
	labelsAny: string[];
	addedLabelsAny: string[];
	assigneesAny: string[];
	codexCommand: string;
	agentName: string;
	reviewerAssignee: string;
	timeoutSeconds: number;
	maxConcurrentRuns: number;
	promptTemplate?: string;
}

interface AgentAutomationTriggerMatch {
	triggerType: AgentAutomationTriggerType;
	triggerStatus: string;
	triggerSignature: string;
}

interface WorkerLock {
	pid: number;
	startedAt: string;
}

export interface AutomatedQaRunResult {
	success: boolean;
	exitCode?: number;
	error?: string;
	requeue?: boolean;
	pauseQueue?: boolean;
	stdoutExcerpt?: string;
	stderrExcerpt?: string;
	lastOutputAt?: string;
	lastOutputSource?: "stdout" | "stderr";
	lastOutputExcerpt?: string;
}

export interface AutomatedQaProcessStart {
	pid: number;
	startedAt: string;
	command: string;
	args: string[];
}

export interface AutomatedQaHeartbeatEvent {
	timestamp: string;
	phase: AutomatedQaRunPhase;
	note: string;
}

export interface AutomatedQaOutputEvent {
	timestamp: string;
	source: "stdout" | "stderr";
	chunk: string;
}

export interface AutomatedQaRunnerOptions {
	projectRoot: string;
	taskId: string;
	prompt: string;
	codexCommand: string;
	timeoutSeconds: number;
	onProcessStarted?: (event: AutomatedQaProcessStart) => Promise<void> | void;
	onHeartbeat?: (event: AutomatedQaHeartbeatEvent) => Promise<void> | void;
	onOutput?: (event: AutomatedQaOutputEvent) => Promise<void> | void;
}

export type AutomatedQaRunner = (options: AutomatedQaRunnerOptions) => Promise<AutomatedQaRunResult>;

export interface AutomatedQaCommandInvocation {
	command: string;
	args: string[];
	shell: boolean;
}

const MAX_PROMPT_FIELD_LENGTH = 1500;
const MAX_PROMPT_CHECKLIST_ITEMS = 12;
const MAX_PROMPT_LIST_ITEMS = 12;
const AUTOMATED_QA_HEARTBEAT_INTERVAL_MS = 15_000;
const AUTOMATED_QA_STALE_THRESHOLD_MS = 60_000;
const AUTOMATED_QA_OUTPUT_EXCERPT_MAX_LENGTH = 8_000;
const AUTOMATED_QA_LAST_OUTPUT_MAX_LENGTH = 500;
const AUTOMATED_QA_PROCESS_SCAN_INTERVAL_MS = 1_000;
const CODEX_USAGE_LIMIT_ERROR_PATTERN =
	/(?:^|\n)\[[^\]]+\]\s+ERROR:\s+.*\b(?:usage limit|rate limit|quota)\b.*(?:\n|$)/i;
const DISABLE_MULTI_AGENT_CONFIG = "features.multi_agent=false";
const NESTED_CODEX_GUARD_MESSAGE = "Nested Codex launches are disabled during Backlog automated QA reviewer runs.";

interface ProcessSnapshot {
	pid: number;
	parentPid: number;
	name?: string;
	executablePath?: string;
	commandLine?: string;
}

function normalizeAutomatedQaTimeoutSeconds(timeoutSeconds: unknown): number {
	if (typeof timeoutSeconds !== "number" || !Number.isFinite(timeoutSeconds)) {
		return DEFAULT_TIMEOUT_SECONDS;
	}
	return Math.max(30, Math.floor(timeoutSeconds));
}

function detectAutomatedQaReviewerQuotaError(
	stdoutExcerpt?: string,
	stderrExcerpt?: string,
	lastOutputExcerpt?: string,
): string | undefined {
	const outputText = [lastOutputExcerpt, stderrExcerpt, stdoutExcerpt].filter(Boolean).join("\n");
	const match = outputText.match(CODEX_USAGE_LIMIT_ERROR_PATTERN);
	if (!match) {
		return undefined;
	}
	return `Automated QA reviewer hit a Codex usage/rate-limit error: ${match[0].trim()}`;
}

function detectAutomatedQaNestedCodexGuardError(
	stdoutExcerpt?: string,
	stderrExcerpt?: string,
	lastOutputExcerpt?: string,
): string | undefined {
	const outputText = [lastOutputExcerpt, stderrExcerpt, stdoutExcerpt].filter(Boolean).join("\n");
	if (!outputText.includes(NESTED_CODEX_GUARD_MESSAGE)) {
		return undefined;
	}
	return `Automated QA reviewer attempted a nested Codex launch blocked by the runtime guard: ${NESTED_CODEX_GUARD_MESSAGE}`;
}

function finalizeAutomatedQaRunResult(
	result: AutomatedQaRunResult,
	finalTaskStatus: string | undefined,
	triggerStatus: string,
): AutomatedQaRunResult {
	const quotaError = detectAutomatedQaReviewerQuotaError(
		result.stdoutExcerpt,
		result.stderrExcerpt,
		result.lastOutputExcerpt,
	);
	if (quotaError) {
		return {
			...result,
			success: false,
			error: quotaError,
			requeue: false,
			pauseQueue: true,
		};
	}

	const nestedCodexGuardError = detectAutomatedQaNestedCodexGuardError(
		result.stdoutExcerpt,
		result.stderrExcerpt,
		result.lastOutputExcerpt,
	);
	if (nestedCodexGuardError) {
		return {
			...result,
			success: false,
			error: nestedCodexGuardError,
			requeue: false,
			pauseQueue: true,
		};
	}

	if (result.success && statusesMatch(finalTaskStatus ?? "", triggerStatus)) {
		return {
			...result,
			success: false,
			error: `Automated QA reviewer exited without moving the task out of ${triggerStatus}; automated QA was paused to prevent a retry loop.`,
			requeue: false,
			pauseQueue: true,
		};
	}

	return result;
}

function getStatePath(projectRoot: string): string {
	return join(projectRoot, "backlog", STATE_FILENAME);
}

function getRunsPath(projectRoot: string): string {
	return join(projectRoot, "backlog", RUNS_FILENAME);
}

function getLockPath(projectRoot: string): string {
	return join(projectRoot, "backlog", LOCK_FILENAME);
}

function getNestedCodexGuardDir(projectRoot: string): string {
	return join(projectRoot, "backlog", NESTED_CODEX_GUARD_DIRNAME);
}

function getAutomatedQaMutationQueueKey(projectRoot: string, kind: "state" | "runs"): string {
	return `${projectRoot}::${kind}`;
}

export function normalizeAutomatedQaConfig(config: AutomatedQaConfig | undefined): NormalizedAutomatedQaConfig {
	return normalizeAgentAutomationConfig(
		{
			id: DEFAULT_AUTOMATION_ID,
			name: DEFAULT_AUTOMATION_NAME,
			enabled: config?.enabled,
			paused: config?.paused,
			trigger: {
				type: "status_transition",
				toStatus: config?.triggerStatus,
			},
			codexCommand: config?.codexCommand,
			agentName: config?.agentName,
			reviewerAssignee: config?.reviewerAssignee,
			timeoutSeconds: config?.timeoutSeconds,
			maxConcurrentRuns: DEFAULT_MAX_CONCURRENT_RUNS,
		},
		0,
	);
}

function normalizeStringList(values: unknown): string[] {
	if (!Array.isArray(values)) {
		return [];
	}
	const unique = new Set<string>();
	for (const value of values) {
		if (typeof value !== "string") {
			continue;
		}
		const trimmed = value.trim();
		if (trimmed.length > 0) {
			unique.add(trimmed);
		}
	}
	return Array.from(unique);
}

function normalizeAgentAutomationTrigger(trigger: AgentAutomationTriggerConfig | undefined): {
	triggerType: AgentAutomationTriggerType;
	triggerStatus: string;
	fromStatus?: string;
	labelsAny: string[];
	addedLabelsAny: string[];
	assigneesAny: string[];
} {
	const triggerType = trigger?.type === "label_added" ? "label_added" : "status_transition";
	const triggerStatus =
		trigger?.toStatus?.trim() || (triggerType === "status_transition" ? DEFAULT_TRIGGER_STATUS : "");
	const fromStatus = trigger?.fromStatus?.trim() || undefined;
	return {
		triggerType,
		triggerStatus,
		...(fromStatus ? { fromStatus } : {}),
		labelsAny: normalizeStringList(trigger?.labelsAny),
		addedLabelsAny: normalizeStringList(trigger?.addedLabelsAny),
		assigneesAny: normalizeStringList(trigger?.assigneesAny),
	};
}

function normalizeAgentAutomationConfig(
	config: AgentAutomationConfig | undefined,
	index: number,
): NormalizedAutomatedQaConfig {
	const trigger = normalizeAgentAutomationTrigger(config?.trigger);
	const id = config?.id?.trim() || (index === 0 ? DEFAULT_AUTOMATION_ID : `automation-${index + 1}`);
	const name = config?.name?.trim() || (index === 0 ? DEFAULT_AUTOMATION_NAME : id);
	const maxConcurrentRuns =
		typeof config?.maxConcurrentRuns === "number" && Number.isFinite(config.maxConcurrentRuns)
			? Math.max(1, Math.floor(config.maxConcurrentRuns))
			: DEFAULT_MAX_CONCURRENT_RUNS;
	const promptTemplate = config?.promptTemplate?.trim() || undefined;
	return {
		id,
		name,
		enabled: Boolean(config?.enabled),
		paused: Boolean(config?.paused),
		...trigger,
		codexCommand: config?.codexCommand?.trim() || DEFAULT_CODEX_COMMAND,
		agentName: config?.agentName?.trim() || DEFAULT_AGENT_NAME,
		reviewerAssignee: config?.reviewerAssignee?.trim() || DEFAULT_REVIEWER_ASSIGNEE,
		timeoutSeconds: normalizeAutomatedQaTimeoutSeconds(config?.timeoutSeconds),
		maxConcurrentRuns,
		...(promptTemplate ? { promptTemplate } : {}),
	};
}

export function normalizeAgentAutomationConfigs(
	agentAutomations: AgentAutomationConfig[] | undefined,
	legacyAutomatedQa?: AutomatedQaConfig,
): NormalizedAutomatedQaConfig[] {
	if (Array.isArray(agentAutomations) && agentAutomations.length > 0) {
		return agentAutomations.map((automation, index) => normalizeAgentAutomationConfig(automation, index));
	}
	if (legacyAutomatedQa) {
		return [normalizeAutomatedQaConfig(legacyAutomatedQa)];
	}
	return [normalizeAgentAutomationConfig(undefined, 0)];
}

export function toAgentAutomationConfig(config: NormalizedAutomatedQaConfig): AgentAutomationConfig {
	return {
		id: config.id,
		name: config.name,
		enabled: config.enabled,
		paused: config.paused,
		trigger: {
			type: config.triggerType,
			...(config.triggerStatus ? { toStatus: config.triggerStatus } : {}),
			...(config.fromStatus ? { fromStatus: config.fromStatus } : {}),
			...(config.labelsAny.length > 0 ? { labelsAny: [...config.labelsAny] } : {}),
			...(config.addedLabelsAny.length > 0 ? { addedLabelsAny: [...config.addedLabelsAny] } : {}),
			...(config.assigneesAny.length > 0 ? { assigneesAny: [...config.assigneesAny] } : {}),
		},
		codexCommand: config.codexCommand,
		agentName: config.agentName,
		reviewerAssignee: config.reviewerAssignee,
		timeoutSeconds: config.timeoutSeconds,
		maxConcurrentRuns: config.maxConcurrentRuns,
		...(config.promptTemplate ? { promptTemplate: config.promptTemplate } : {}),
	};
}

async function delay(ms: number): Promise<void> {
	return await new Promise((resolve) => setTimeout(resolve, ms));
}

async function readProcessCommandOutput(command: string, args: string[]): Promise<string | undefined> {
	return await new Promise((resolve) => {
		let stdout = "";
		const child = spawn(command, args, {
			shell: false,
			stdio: ["ignore", "pipe", "ignore"],
			windowsHide: true,
		});
		child.stdout.on("data", (chunk) => {
			stdout += String(chunk);
		});
		child.on("error", () => {
			resolve(undefined);
		});
		child.on("close", (exitCode) => {
			if (exitCode !== 0) {
				resolve(undefined);
				return;
			}
			resolve(stdout);
		});
	});
}

function isCodexProcessSnapshot(snapshot: ProcessSnapshot): boolean {
	const candidates = [snapshot.name, snapshot.executablePath, snapshot.commandLine]
		.filter((value): value is string => typeof value === "string" && value.trim().length > 0)
		.map((value) => value.toLowerCase());
	for (const value of candidates) {
		const base = basename(value.replace(/^"+|"+$/g, ""));
		if (/^codex(?:\.(?:exe|cmd|bat|ps1))?$/.test(base)) {
			return true;
		}
		if (/(^|[\\/\s"'`])codex(?:\.(?:exe|cmd|bat|ps1))?(?=$|[\\/\s"'`])/.test(value)) {
			return true;
		}
	}
	return false;
}

export function findNestedCodexDescendant(rootPid: number, snapshots: ProcessSnapshot[]): ProcessSnapshot | null {
	if (!Number.isInteger(rootPid) || rootPid <= 0) {
		return null;
	}
	const childrenByParent = new Map<number, ProcessSnapshot[]>();
	for (const snapshot of snapshots) {
		const siblings = childrenByParent.get(snapshot.parentPid) ?? [];
		siblings.push(snapshot);
		childrenByParent.set(snapshot.parentPid, siblings);
	}
	const pending = [...(childrenByParent.get(rootPid) ?? [])];
	while (pending.length > 0) {
		const current = pending.shift();
		if (!current) {
			continue;
		}
		if (isCodexProcessSnapshot(current)) {
			return current;
		}
		pending.push(...(childrenByParent.get(current.pid) ?? []));
	}
	return null;
}

export async function findNestedCodexDescendantProcess(
	rootPid: number,
	platform = process.platform,
): Promise<ProcessSnapshot | null> {
	if (!Number.isInteger(rootPid) || rootPid <= 0) {
		return null;
	}
	if (platform === "win32") {
		const output = await readProcessCommandOutput("powershell.exe", [
			"-NoProfile",
			"-Command",
			[
				"$pending = [System.Collections.Generic.Queue[int]]::new()",
				`$pending.Enqueue(${rootPid})`,
				"while ($pending.Count -gt 0) {",
				"\t$parentPid = $pending.Dequeue()",
				'\t$children = @(Get-CimInstance Win32_Process -Filter ("ParentProcessId=" + $parentPid))',
				"\tforeach ($child in $children) {",
				"\t\t$candidates = @($child.Name, $child.ExecutablePath, $child.CommandLine) | Where-Object { $_ }",
				"\t\t$isCodex = $false",
				"\t\tforeach ($candidate in $candidates) {",
				"\t\t\t$normalized = $candidate.ToLowerInvariant()",
				"\t\t\t$baseName = [System.IO.Path]::GetFileName($normalized.Trim('\"'))",
				"\t\t\tif ($baseName -match '^codex(\\.(exe|cmd|bat|ps1))?$' -or $normalized -match '(?i)(^|[\\\\/\\s\"''`])codex(\\.(exe|cmd|bat|ps1))?(?=$|[\\\\/\\s\"''`])') {",
				"\t\t\t\t$isCodex = $true",
				"\t\t\t\tbreak",
				"\t\t\t}",
				"\t\t}",
				"\t\tif ($isCodex) {",
				"\t\t\t$child | Select-Object ProcessId,ParentProcessId,Name,ExecutablePath,CommandLine | ConvertTo-Json -Compress",
				"\t\t\texit 0",
				"\t\t}",
				"\t\t$pending.Enqueue([int]$child.ProcessId)",
				"\t}",
				"}",
			].join("; "),
		]);
		if (!output?.trim()) {
			return null;
		}
		try {
			const parsed = JSON.parse(output) as {
				ProcessId?: number;
				ParentProcessId?: number;
				Name?: string;
				ExecutablePath?: string;
				CommandLine?: string;
			};
			if (!parsed?.ProcessId) {
				return null;
			}
			return {
				pid: Number(parsed.ProcessId),
				parentPid: Number(parsed.ParentProcessId ?? 0),
				name: parsed.Name,
				executablePath: parsed.ExecutablePath,
				commandLine: parsed.CommandLine,
			};
		} catch {
			return null;
		}
	}

	const output = await readProcessCommandOutput("ps", ["-eo", "pid=,ppid=,comm=,args="]);
	if (!output?.trim()) {
		return null;
	}
	const snapshots = output
		.split(/\r?\n/)
		.map((line) => line.trim())
		.filter(Boolean)
		.map((line): ProcessSnapshot | null => {
			const match = line.match(/^(\d+)\s+(\d+)\s+(\S+)\s*(.*)$/);
			if (!match) {
				return null;
			}
			return {
				pid: Number(match[1]),
				parentPid: Number(match[2]),
				name: match[3],
				commandLine: match[4] || match[3],
				executablePath: match[3],
			};
		})
		.filter((row): row is ProcessSnapshot => row !== null);
	return findNestedCodexDescendant(rootPid, snapshots);
}

export async function killAutomatedQaProcessTree(pid: number, platform = process.platform): Promise<void> {
	if (!Number.isInteger(pid) || pid <= 0) {
		return;
	}
	if (platform === "win32") {
		await readProcessCommandOutput("taskkill.exe", ["/F", "/T", "/PID", String(pid)]);
		return;
	}
	try {
		process.kill(pid, "SIGKILL");
	} catch {}
}

async function readAutomatedQaJsonWithRetry<T>(path: string, fallback: T): Promise<T> {
	for (let attempt = 0; attempt <= AUTOMATED_QA_READ_RETRY_DELAYS_MS.length; attempt += 1) {
		try {
			const raw = await readFile(path, "utf8");
			return JSON.parse(raw) as T;
		} catch {
			if (attempt === AUTOMATED_QA_READ_RETRY_DELAYS_MS.length) {
				return fallback;
			}
			await delay(AUTOMATED_QA_READ_RETRY_DELAYS_MS[attempt] ?? 25);
		}
	}
	return fallback;
}

async function loadAutomatedQaTaskFromDisk(core: Core, taskId: string): Promise<Task | null> {
	for (let attempt = 0; attempt <= AUTOMATED_QA_READ_RETRY_DELAYS_MS.length; attempt += 1) {
		const task = await core.filesystem.loadTask(taskId);
		if (task) {
			return task;
		}
		if (attempt < AUTOMATED_QA_READ_RETRY_DELAYS_MS.length) {
			await delay(AUTOMATED_QA_READ_RETRY_DELAYS_MS[attempt] ?? 25);
		}
	}
	return null;
}

async function loadAutomatedQaTerminalTaskState(
	core: Core,
	taskId: string,
	triggerStatus: string,
): Promise<Task | null> {
	let latestTask: Task | null = null;
	for (let attempt = 0; attempt <= AUTOMATED_QA_READ_RETRY_DELAYS_MS.length; attempt += 1) {
		latestTask = await core.filesystem.loadTask(taskId);
		if (latestTask && !statusesMatch(latestTask.status ?? "", triggerStatus)) {
			return latestTask;
		}
		if (attempt < AUTOMATED_QA_READ_RETRY_DELAYS_MS.length) {
			await delay(AUTOMATED_QA_READ_RETRY_DELAYS_MS[attempt] ?? 25);
		}
	}
	return latestTask;
}

async function runSerializedAutomatedQaMutation<T>(
	projectRoot: string,
	kind: "state" | "runs",
	work: () => Promise<T>,
): Promise<T> {
	const queueKey = getAutomatedQaMutationQueueKey(projectRoot, kind);
	const previous = automatedQaMutationQueues.get(queueKey) ?? Promise.resolve();
	let release: (() => void) | undefined;
	const next = new Promise<void>((resolve) => {
		release = resolve;
	});
	automatedQaMutationQueues.set(
		queueKey,
		previous.then(() => next),
	);
	try {
		await previous;
		return await work();
	} finally {
		release?.();
		if (automatedQaMutationQueues.get(queueKey) === next) {
			automatedQaMutationQueues.delete(queueKey);
		}
	}
}

function normalizeAutomatedQaRunStatus(status: unknown): AutomatedQaRunStatus {
	switch (status) {
		case "queued":
		case "started":
		case "succeeded":
		case "failed":
		case "abandoned":
		case "skipped":
			return status;
		default:
			return "failed";
	}
}

function normalizeAutomatedQaRunPhase(phase: unknown): AutomatedQaRunPhase | undefined {
	switch (phase) {
		case "queued":
		case "worker_claimed":
		case "reviewer_launching":
		case "reviewer_running":
		case "reviewer_completed":
		case "reviewer_failed":
		case "abandoned":
		case "skipped":
			return phase;
		default:
			return undefined;
	}
}

function normalizeAutomatedQaRunRecord(
	run: Partial<AutomatedQaRunRecord> | null | undefined,
): AutomatedQaRunRecord | null {
	if (!run) {
		return null;
	}
	const id = typeof run.id === "string" && run.id.trim() ? run.id.trim() : undefined;
	const taskId = typeof run.taskId === "string" && run.taskId.trim() ? run.taskId.trim() : undefined;
	const queuedAt = typeof run.queuedAt === "string" && run.queuedAt.trim() ? run.queuedAt.trim() : undefined;
	if (!id || !taskId || !queuedAt) {
		return null;
	}
	return {
		id,
		taskId,
		queueEntryId: typeof run.queueEntryId === "string" && run.queueEntryId.trim() ? run.queueEntryId.trim() : undefined,
		automationId:
			typeof run.automationId === "string" && run.automationId.trim() ? run.automationId.trim() : DEFAULT_AUTOMATION_ID,
		automationName:
			typeof run.automationName === "string" && run.automationName.trim()
				? run.automationName.trim()
				: DEFAULT_AUTOMATION_NAME,
		triggerType: run.triggerType === "label_added" ? "label_added" : "status_transition",
		triggerSignature:
			typeof run.triggerSignature === "string" && run.triggerSignature.trim()
				? run.triggerSignature.trim()
				: `${DEFAULT_AUTOMATION_ID}::${taskId}::status_transition::to:${DEFAULT_TRIGGER_STATUS}`,
		status: normalizeAutomatedQaRunStatus(run.status),
		phase: normalizeAutomatedQaRunPhase(run.phase),
		triggerStatus:
			typeof run.triggerStatus === "string" && run.triggerStatus.trim()
				? run.triggerStatus.trim()
				: DEFAULT_TRIGGER_STATUS,
		agentName: typeof run.agentName === "string" && run.agentName.trim() ? run.agentName.trim() : DEFAULT_AGENT_NAME,
		reviewerAssignee:
			typeof run.reviewerAssignee === "string" && run.reviewerAssignee.trim()
				? run.reviewerAssignee.trim()
				: DEFAULT_REVIEWER_ASSIGNEE,
		queuedAt,
		startedAt: typeof run.startedAt === "string" && run.startedAt.trim() ? run.startedAt.trim() : undefined,
		completedAt: typeof run.completedAt === "string" && run.completedAt.trim() ? run.completedAt.trim() : undefined,
		lastHeartbeatAt:
			typeof run.lastHeartbeatAt === "string" && run.lastHeartbeatAt.trim() ? run.lastHeartbeatAt.trim() : undefined,
		lastHeartbeatNote:
			typeof run.lastHeartbeatNote === "string" && run.lastHeartbeatNote.trim()
				? run.lastHeartbeatNote.trim()
				: undefined,
		workerPid: typeof run.workerPid === "number" && Number.isFinite(run.workerPid) ? run.workerPid : undefined,
		codexPid: typeof run.codexPid === "number" && Number.isFinite(run.codexPid) ? run.codexPid : undefined,
		codexCommand: typeof run.codexCommand === "string" && run.codexCommand.trim() ? run.codexCommand.trim() : undefined,
		stdoutExcerpt: typeof run.stdoutExcerpt === "string" && run.stdoutExcerpt.trim() ? run.stdoutExcerpt : undefined,
		stderrExcerpt: typeof run.stderrExcerpt === "string" && run.stderrExcerpt.trim() ? run.stderrExcerpt : undefined,
		lastOutputAt: typeof run.lastOutputAt === "string" && run.lastOutputAt.trim() ? run.lastOutputAt.trim() : undefined,
		lastOutputSource:
			run.lastOutputSource === "stdout" || run.lastOutputSource === "stderr" ? run.lastOutputSource : undefined,
		lastOutputExcerpt:
			typeof run.lastOutputExcerpt === "string" && run.lastOutputExcerpt.trim() ? run.lastOutputExcerpt : undefined,
		error: typeof run.error === "string" && run.error.trim() ? run.error.trim() : undefined,
		exitCode: typeof run.exitCode === "number" && Number.isFinite(run.exitCode) ? run.exitCode : undefined,
		finalTaskStatus:
			typeof run.finalTaskStatus === "string" && run.finalTaskStatus.trim() ? run.finalTaskStatus.trim() : undefined,
	};
}

function normalizeAutomatedQaRuns(runs: unknown): AutomatedQaRunRecord[] {
	if (!Array.isArray(runs)) {
		return [];
	}
	return runs
		.map((value) => normalizeAutomatedQaRunRecord(value as Partial<AutomatedQaRunRecord>))
		.filter((value): value is AutomatedQaRunRecord => value !== null)
		.sort((left, right) => left.queuedAt.localeCompare(right.queuedAt));
}

function createAutomatedQaRun(
	queueItem: AgentAutomationQueueItem,
	config: NormalizedAutomatedQaConfig,
): AutomatedQaRunRecord {
	const queuedAt = new Date().toISOString();
	return {
		id: randomUUID(),
		taskId: queueItem.taskId,
		queueEntryId: queueItem.id,
		automationId: queueItem.automationId,
		automationName: queueItem.automationName ?? config.name,
		triggerType: queueItem.triggerType,
		triggerSignature: queueItem.triggerSignature,
		status: "queued",
		phase: "queued",
		triggerStatus: queueItem.triggerStatus ?? config.triggerStatus,
		agentName: config.agentName,
		reviewerAssignee: config.reviewerAssignee,
		queuedAt: queueItem.queuedAt || queuedAt,
		lastHeartbeatAt: queuedAt,
		lastHeartbeatNote: "Queued for automated QA",
	};
}

function isOpenRunStatus(status: AutomatedQaRunStatus): boolean {
	return status === "queued" || status === "started";
}

function findLatestRunIndex(
	runs: AutomatedQaRunRecord[],
	taskId: string,
	allowedStatuses?: AutomatedQaRunStatus[],
	queueEntryId?: string,
): number {
	for (let index = runs.length - 1; index >= 0; index -= 1) {
		const run = runs[index];
		if (!run || run.taskId !== taskId) {
			continue;
		}
		if (queueEntryId && run.queueEntryId !== queueEntryId) {
			continue;
		}
		if (!allowedStatuses || allowedStatuses.includes(run.status)) {
			return index;
		}
	}
	return -1;
}

function buildLegacyAutomationQueueItem(taskId: string, queuedAt?: string): AgentAutomationQueueItem {
	const normalizedTaskId = taskId.trim();
	return {
		id: `${DEFAULT_AUTOMATION_ID}::${normalizedTaskId}::status_transition::to:${DEFAULT_TRIGGER_STATUS}`,
		taskId: normalizedTaskId,
		automationId: DEFAULT_AUTOMATION_ID,
		automationName: DEFAULT_AUTOMATION_NAME,
		triggerType: "status_transition",
		triggerStatus: DEFAULT_TRIGGER_STATUS,
		triggerSignature: `to:${DEFAULT_TRIGGER_STATUS}`,
		queuedAt: queuedAt ?? new Date().toISOString(),
	};
}

function normalizeAutomationQueueItem(
	item: Partial<AgentAutomationQueueItem> | string | null | undefined,
): AgentAutomationQueueItem | null {
	if (typeof item === "string") {
		return item.trim() ? buildLegacyAutomationQueueItem(item) : null;
	}
	if (!item) {
		return null;
	}
	const taskId = typeof item.taskId === "string" && item.taskId.trim() ? item.taskId.trim() : undefined;
	if (!taskId) {
		return null;
	}
	const automationId =
		typeof item.automationId === "string" && item.automationId.trim()
			? item.automationId.trim()
			: DEFAULT_AUTOMATION_ID;
	const triggerType = item.triggerType === "label_added" ? "label_added" : "status_transition";
	const triggerStatus =
		typeof item.triggerStatus === "string" && item.triggerStatus.trim() ? item.triggerStatus.trim() : undefined;
	const triggerSignature =
		typeof item.triggerSignature === "string" && item.triggerSignature.trim()
			? item.triggerSignature.trim()
			: triggerStatus
				? `to:${triggerStatus}`
				: "event:default";
	const id =
		typeof item.id === "string" && item.id.trim()
			? item.id.trim()
			: `${automationId}::${taskId}::${triggerType}::${triggerSignature}`;
	const queuedAt =
		typeof item.queuedAt === "string" && item.queuedAt.trim() ? item.queuedAt.trim() : new Date().toISOString();
	return {
		id,
		taskId,
		automationId,
		automationName:
			typeof item.automationName === "string" && item.automationName.trim() ? item.automationName.trim() : automationId,
		triggerType,
		...(triggerStatus ? { triggerStatus } : {}),
		triggerSignature,
		queuedAt,
	};
}

function normalizeAutomationQueueItems(
	items: Array<Partial<AgentAutomationQueueItem> | string> | undefined,
	legacyTaskIds?: string[],
): AgentAutomationQueueItem[] {
	const sourceItems = Array.isArray(items) ? items : (legacyTaskIds ?? []);
	const queueItems: AgentAutomationQueueItem[] = [];
	const seenIds = new Set<string>();
	for (const item of sourceItems) {
		const normalized = normalizeAutomationQueueItem(item);
		if (!normalized || seenIds.has(normalized.id)) {
			continue;
		}
		seenIds.add(normalized.id);
		queueItems.push(normalized);
	}
	return queueItems;
}

export function normalizeAutomatedQaState(state: Partial<AutomatedQaState> | null | undefined): AutomatedQaState {
	const queuedRuns = normalizeAutomationQueueItems(state?.queuedRuns, state?.queuedTaskIds);
	const activeRuns = normalizeAutomationQueueItems(state?.activeRuns, state?.activeTaskIds);
	const queuedTaskIds = Array.from(new Set(queuedRuns.map((entry) => entry.taskId)));
	const activeTaskIds = Array.from(new Set(activeRuns.map((entry) => entry.taskId)));
	return {
		queuedTaskIds,
		activeTaskIds,
		queuedRuns,
		activeRuns,
		lastRunAt: typeof state?.lastRunAt === "string" && state.lastRunAt.trim() ? state.lastRunAt : undefined,
		lastCompletedTaskId:
			typeof state?.lastCompletedTaskId === "string" && state.lastCompletedTaskId.trim()
				? state.lastCompletedTaskId
				: undefined,
		lastError: typeof state?.lastError === "string" && state.lastError.trim() ? state.lastError : undefined,
	};
}

export async function loadAutomatedQaState(projectRoot: string): Promise<AutomatedQaState> {
	const parsed = await readAutomatedQaJsonWithRetry<Partial<AutomatedQaState> | undefined>(
		getStatePath(projectRoot),
		undefined,
	);
	return normalizeAutomatedQaState(parsed);
}

export async function saveAutomatedQaState(projectRoot: string, state: AutomatedQaState): Promise<void> {
	const normalized = normalizeAutomatedQaState(state);
	await writeFile(getStatePath(projectRoot), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

export async function loadAutomatedQaRuns(projectRoot: string): Promise<AutomatedQaRunRecord[]> {
	const parsed = await readAutomatedQaJsonWithRetry<unknown>(getRunsPath(projectRoot), []);
	return normalizeAutomatedQaRuns(parsed);
}

export async function saveAutomatedQaRuns(projectRoot: string, runs: AutomatedQaRunRecord[]): Promise<void> {
	const normalized = normalizeAutomatedQaRuns(runs);
	await writeFile(getRunsPath(projectRoot), `${JSON.stringify(normalized, null, 2)}\n`, "utf8");
}

async function loadWorkerLock(projectRoot: string): Promise<WorkerLock | null> {
	try {
		const raw = await readFile(getLockPath(projectRoot), "utf8");
		const parsed = JSON.parse(raw) as Partial<WorkerLock>;
		if (typeof parsed.pid !== "number" || !Number.isFinite(parsed.pid) || parsed.pid <= 0) {
			return null;
		}
		if (typeof parsed.startedAt !== "string" || !parsed.startedAt.trim()) {
			return null;
		}
		return {
			pid: parsed.pid,
			startedAt: parsed.startedAt,
		};
	} catch {
		return null;
	}
}

function isProcessRunning(pid: number): boolean {
	try {
		process.kill(pid, 0);
		return true;
	} catch {
		return false;
	}
}

export async function ensureWorkerLock(projectRoot: string): Promise<boolean> {
	const lockPath = getLockPath(projectRoot);
	const existingLock = await loadWorkerLock(projectRoot);
	if (existingLock && isProcessRunning(existingLock.pid)) {
		return false;
	}
	if (existingLock) {
		await rm(lockPath, { force: true }).catch(() => {});
	}
	const handle = await open(lockPath, "wx");
	try {
		const payload: WorkerLock = {
			pid: process.pid,
			startedAt: new Date().toISOString(),
		};
		await handle.writeFile(`${JSON.stringify(payload, null, 2)}\n`, "utf8");
	} finally {
		await handle.close();
	}
	return true;
}

export async function clearWorkerLock(projectRoot: string): Promise<void> {
	await rm(getLockPath(projectRoot), { force: true }).catch(() => {});
}

async function mutateAutomatedQaState(
	projectRoot: string,
	mutator: (state: AutomatedQaState) => AutomatedQaState | Promise<AutomatedQaState>,
): Promise<AutomatedQaState> {
	return await runSerializedAutomatedQaMutation(projectRoot, "state", async () => {
		const current = await loadAutomatedQaState(projectRoot);
		const next = normalizeAutomatedQaState(await mutator(current));
		await saveAutomatedQaState(projectRoot, next);
		return next;
	});
}

async function mutateAutomatedQaRuns(
	projectRoot: string,
	mutator: (runs: AutomatedQaRunRecord[]) => AutomatedQaRunRecord[] | Promise<AutomatedQaRunRecord[]>,
): Promise<AutomatedQaRunRecord[]> {
	return await runSerializedAutomatedQaMutation(projectRoot, "runs", async () => {
		const current = await loadAutomatedQaRuns(projectRoot);
		const next = normalizeAutomatedQaRuns(await mutator(current));
		await saveAutomatedQaRuns(projectRoot, next);
		return next;
	});
}

function statusesMatch(left: string, right: string): boolean {
	return left.trim().toLowerCase() === right.trim().toLowerCase();
}

function valuesIntersect(left: string[] | undefined, right: string[] | undefined): boolean {
	if (!left || !right || left.length === 0 || right.length === 0) {
		return false;
	}
	const rightValues = new Set(right.map((value) => value.trim().toLowerCase()).filter(Boolean));
	return left.some((value) => rightValues.has(value.trim().toLowerCase()));
}

function listSignature(values: string[]): string {
	return values
		.map((value) => value.trim())
		.filter(Boolean)
		.sort((left, right) => left.localeCompare(right))
		.join(",");
}

function getAddedTaskLabels(previousTask: Task | undefined, task: Task): string[] {
	const previousLabels = new Set(
		(previousTask?.labels ?? []).map((label) => label.trim().toLowerCase()).filter(Boolean),
	);
	return (task.labels ?? []).filter((label) => {
		const normalized = label.trim().toLowerCase();
		return normalized.length > 0 && !previousLabels.has(normalized);
	});
}

function taskMatchesAutomationFilters(task: Task, config: NormalizedAutomatedQaConfig): boolean {
	if (config.labelsAny.length > 0 && !valuesIntersect(task.labels ?? [], config.labelsAny)) {
		return false;
	}
	if (config.assigneesAny.length > 0 && !valuesIntersect(task.assignee ?? [], config.assigneesAny)) {
		return false;
	}
	return true;
}

function findAgentAutomationTriggerMatch(
	previousTask: Task | undefined,
	task: Task,
	config: NormalizedAutomatedQaConfig,
): AgentAutomationTriggerMatch | null {
	if (!taskMatchesAutomationFilters(task, config)) {
		return null;
	}

	if (config.triggerType === "label_added") {
		if (!previousTask || config.addedLabelsAny.length === 0) {
			return null;
		}
		const addedLabels = getAddedTaskLabels(previousTask, task);
		const matchedLabels = addedLabels.filter((label) => valuesIntersect([label], config.addedLabelsAny));
		if (matchedLabels.length === 0) {
			return null;
		}
		if (config.triggerStatus && !statusesMatch(task.status ?? "", config.triggerStatus)) {
			return null;
		}
		return {
			triggerType: "label_added",
			triggerStatus: config.triggerStatus,
			triggerSignature: `labels:${listSignature(matchedLabels)}|status:${config.triggerStatus}`,
		};
	}

	if (!statusesMatch(task.status ?? "", config.triggerStatus)) {
		return null;
	}

	if (previousTask) {
		const oldStatus = previousTask.status ?? "";
		const statusChanged = !statusesMatch(oldStatus, task.status ?? "");
		if (!statusChanged) {
			return null;
		}
		if (config.fromStatus && !statusesMatch(oldStatus, config.fromStatus)) {
			return null;
		}
		return {
			triggerType: "status_transition",
			triggerStatus: config.triggerStatus,
			triggerSignature: `from:${oldStatus || "*"}|to:${config.triggerStatus}|labels:${listSignature(
				config.labelsAny,
			)}|assignees:${listSignature(config.assigneesAny)}`,
		};
	}

	return {
		triggerType: "status_transition",
		triggerStatus: config.triggerStatus,
		triggerSignature: `sweep:${config.triggerStatus}|labels:${listSignature(config.labelsAny)}|assignees:${listSignature(
			config.assigneesAny,
		)}`,
	};
}

function compactPromptText(value: string | undefined, maxLength = MAX_PROMPT_FIELD_LENGTH): string | undefined {
	const trimmed = value?.trim();
	if (!trimmed) {
		return undefined;
	}
	if (trimmed.length <= maxLength) {
		return trimmed;
	}
	return `${trimmed.slice(0, maxLength - 3).trimEnd()}...`;
}

function stripAnsiCodes(value: string): string {
	let result = "";
	for (let index = 0; index < value.length; index += 1) {
		if (value.charCodeAt(index) === 27 && value[index + 1] === "[") {
			index += 2;
			while (index < value.length) {
				const code = value.charCodeAt(index);
				if (code >= 64 && code <= 126) {
					break;
				}
				index += 1;
			}
			continue;
		}
		result += value[index] ?? "";
	}
	return result;
}

function normalizeAutomatedQaOutputChunk(value: string): string {
	return stripAnsiCodes(value).replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function trimAutomatedQaOutputTail(value: string | undefined, maxLength: number): string | undefined {
	const normalized = value?.trim();
	if (!normalized) {
		return undefined;
	}
	if (normalized.length <= maxLength) {
		return normalized;
	}
	return `...${normalized.slice(-(maxLength - 3))}`;
}

function appendAutomatedQaOutputExcerpt(
	currentValue: string | undefined,
	chunk: string,
	maxLength = AUTOMATED_QA_OUTPUT_EXCERPT_MAX_LENGTH,
): string | undefined {
	const normalizedChunk = normalizeAutomatedQaOutputChunk(chunk);
	if (!normalizedChunk.trim()) {
		return currentValue;
	}
	const nextValue = `${currentValue ?? ""}${normalizedChunk}`;
	return trimAutomatedQaOutputTail(nextValue, maxLength);
}

function padTimestampPart(value: number, length = 2): string {
	return String(value).padStart(length, "0");
}

export function formatLocalTimestamp(dateInput: Date | string | number): string {
	const date = dateInput instanceof Date ? dateInput : new Date(dateInput);
	const year = date.getFullYear();
	const month = padTimestampPart(date.getMonth() + 1);
	const day = padTimestampPart(date.getDate());
	const hours = padTimestampPart(date.getHours());
	const minutes = padTimestampPart(date.getMinutes());
	const seconds = padTimestampPart(date.getSeconds());
	const milliseconds = padTimestampPart(date.getMilliseconds(), 3);
	const offsetMinutes = -date.getTimezoneOffset();
	const offsetSign = offsetMinutes >= 0 ? "+" : "-";
	const absoluteOffsetMinutes = Math.abs(offsetMinutes);
	const offsetHours = padTimestampPart(Math.floor(absoluteOffsetMinutes / 60));
	const offsetRemainderMinutes = padTimestampPart(absoluteOffsetMinutes % 60);
	return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}.${milliseconds} ${offsetSign}${offsetHours}:${offsetRemainderMinutes}`;
}

export function isAutomatedQaHeartbeatStale(heartbeatAt: string | undefined, now = Date.now()): boolean {
	if (!heartbeatAt) {
		return false;
	}
	const heartbeatMs = new Date(heartbeatAt).getTime();
	if (Number.isNaN(heartbeatMs)) {
		return false;
	}
	return now - heartbeatMs > AUTOMATED_QA_STALE_THRESHOLD_MS;
}

export function getAutomatedQaStaleThresholdMs(): number {
	return AUTOMATED_QA_STALE_THRESHOLD_MS;
}

function formatPromptChecklist(
	items: Task["acceptanceCriteriaItems"] | Task["definitionOfDoneItems"],
	maxItems = MAX_PROMPT_CHECKLIST_ITEMS,
): string {
	if (!items || items.length === 0) {
		return "- none";
	}
	const visibleItems = items.slice(0, maxItems);
	const lines = visibleItems.map((item) => `- [${item.checked ? "x" : " "}] ${item.text}`);
	if (items.length > visibleItems.length) {
		lines.push(`- ... (${items.length - visibleItems.length} more items omitted)`);
	}
	return lines.join("\n");
}

function formatPromptList(items: string[] | undefined, maxItems = MAX_PROMPT_LIST_ITEMS): string {
	if (!items || items.length === 0) {
		return "- none";
	}
	const visibleItems = items.slice(0, maxItems);
	const lines = visibleItems.map((item) => `- ${item}`);
	if (items.length > visibleItems.length) {
		lines.push(`- ... (${items.length - visibleItems.length} more items omitted)`);
	}
	return lines.join("\n");
}

function buildAutomatedQaTaskSnapshot(task: Task): string {
	const sections = [
		"Task snapshot:",
		`- ID: ${task.id}`,
		`- Title: ${task.title}`,
		`- Status: ${task.status}`,
		`- Assignee: ${task.assignee.length > 0 ? task.assignee.join(", ") : "unassigned"}`,
		`- Labels: ${task.labels.length > 0 ? task.labels.join(", ") : "none"}`,
		"",
		"Description:",
		compactPromptText(task.description) ?? "(none)",
		"",
		"Acceptance Criteria:",
		formatPromptChecklist(task.acceptanceCriteriaItems),
		"",
		"Definition of Done:",
		formatPromptChecklist(task.definitionOfDoneItems),
		"",
		"Implementation Notes:",
		compactPromptText(task.implementationNotes) ?? "(none)",
		"",
		"Final Summary:",
		compactPromptText(task.finalSummary) ?? "(none)",
		"",
		"References:",
		formatPromptList(task.references),
		"",
		"Documentation:",
		formatPromptList(task.documentation),
	];
	return sections.join("\n");
}

function buildAutomatedQaAuditActor(
	automation: Pick<NormalizedAutomatedQaConfig, "id" | "name" | "agentName">,
	queueEntryId?: string,
): TaskAuditActor {
	return {
		kind: "automation",
		source: "automation-worker",
		automationId: automation.id,
		automationName: automation.name,
		...(queueEntryId ? { queueEntryId, runId: queueEntryId } : {}),
		agentName: automation.agentName,
		processId: process.pid,
	};
}

function buildAutomatedQaAuditEvent(
	queueItem: AgentAutomationQueueItem,
	automation: Pick<NormalizedAutomatedQaConfig, "id" | "name" | "agentName" | "reviewerAssignee" | "codexCommand">,
	eventType: TaskAuditEventType,
	summary: string,
	data: Record<string, unknown> = {},
	occurredAt = new Date(),
): TaskAuditEvent {
	return {
		id: randomUUID(),
		taskId: queueItem.taskId,
		eventType,
		occurredAt: occurredAt.toISOString(),
		actor: buildAutomatedQaAuditActor(automation, queueItem.id),
		summary,
		data: {
			automationId: automation.id,
			automationName: automation.name,
			queueEntryId: queueItem.id,
			runId: queueItem.id,
			triggerType: queueItem.triggerType,
			triggerStatus: queueItem.triggerStatus ?? "",
			triggerSignature: queueItem.triggerSignature,
			reviewerAssignee: automation.reviewerAssignee,
			codexCommand: automation.codexCommand,
			...data,
		},
	};
}

async function appendAutomatedQaAuditEvent(
	projectRoot: string,
	queueItem: AgentAutomationQueueItem,
	automation: Pick<NormalizedAutomatedQaConfig, "id" | "name" | "agentName" | "reviewerAssignee" | "codexCommand">,
	eventType: TaskAuditEventType,
	summary: string,
	data: Record<string, unknown> = {},
	occurredAt = new Date(),
): Promise<void> {
	const filesystem = new FileSystem(projectRoot);
	await filesystem.appendTaskAuditEvent(
		buildAutomatedQaAuditEvent(queueItem, automation, eventType, summary, data, occurredAt),
	);
}

async function appendAutomatedQaRunRecordAuditEvent(
	projectRoot: string,
	run: AutomatedQaRunRecord,
	eventType: TaskAuditEventType,
	summary: string,
	data: Record<string, unknown> = {},
	occurredAt = new Date(),
): Promise<void> {
	await appendAutomatedQaAuditEvent(
		projectRoot,
		{
			id: run.queueEntryId ?? `${run.automationId ?? DEFAULT_AUTOMATION_ID}::${run.taskId}`,
			taskId: run.taskId,
			automationId: run.automationId ?? DEFAULT_AUTOMATION_ID,
			automationName: run.automationName ?? DEFAULT_AUTOMATION_NAME,
			triggerType: run.triggerType ?? "status_transition",
			triggerStatus: run.triggerStatus,
			triggerSignature: run.triggerSignature ?? `to:${run.triggerStatus}`,
			queuedAt: run.queuedAt,
		},
		{
			id: run.automationId ?? DEFAULT_AUTOMATION_ID,
			name: run.automationName ?? DEFAULT_AUTOMATION_NAME,
			agentName: run.agentName,
			reviewerAssignee: run.reviewerAssignee,
			codexCommand: run.codexCommand ?? DEFAULT_CODEX_COMMAND,
		},
		eventType,
		summary,
		data,
		occurredAt,
	);
}

async function appendAutomatedQaActivityNote(
	core: Core,
	taskId: string,
	note: string,
	auditActor?: TaskAuditActor,
): Promise<void> {
	await core.updateTaskFromInput(
		taskId,
		{
			appendImplementationNotes: [note],
		},
		undefined,
		auditActor,
	);
}

function quoteShellArg(value: string, platform = process.platform): string {
	if (platform === "win32") {
		if (/^[A-Za-z0-9_:\\/.=-]+$/.test(value)) {
			return value;
		}
		return `"${value.replace(/"/g, '""')}"`;
	}
	if (/^[A-Za-z0-9_./:=+-]+$/.test(value)) {
		return value;
	}
	return `'${value.replace(/'/g, `'\\''`)}'`;
}

function getPathEnvKey(env: NodeJS.ProcessEnv = process.env, platform = process.platform): string {
	if (platform === "win32") {
		return Object.keys(env).find((key) => key.toLowerCase() === "path") ?? "Path";
	}
	return "PATH";
}

function resolveAutomatedQaCodexCommandPath(
	codexCommand: string,
	platform = process.platform,
	env: NodeJS.ProcessEnv = process.env,
): string {
	const trimmedCommand = codexCommand.trim();
	if (!trimmedCommand || /[\s"'`]/.test(trimmedCommand) || trimmedCommand.includes(sep) || isAbsolute(trimmedCommand)) {
		return trimmedCommand || codexCommand;
	}
	const pathValue = env[getPathEnvKey(env, platform)];
	if (!pathValue) {
		return codexCommand;
	}
	const executableNames =
		platform === "win32"
			? [trimmedCommand, `${trimmedCommand}.exe`, `${trimmedCommand}.cmd`, `${trimmedCommand}.bat`]
			: [trimmedCommand];
	for (const dir of pathValue.split(delimiter)) {
		if (!dir.trim()) {
			continue;
		}
		for (const executableName of executableNames) {
			const candidatePath = join(dir, executableName);
			if (existsSync(candidatePath)) {
				return candidatePath;
			}
		}
	}
	return codexCommand;
}

async function buildAutomatedQaReviewerEnv(projectRoot: string): Promise<NodeJS.ProcessEnv> {
	const guardDir = getNestedCodexGuardDir(projectRoot);
	await mkdir(guardDir, { recursive: true });
	if (process.platform === "win32") {
		await writeFile(
			join(guardDir, "codex.cmd"),
			`@echo off\r\necho ERROR: ${NESTED_CODEX_GUARD_MESSAGE} 1>&2\r\nexit /b 1\r\n`,
			"utf8",
		);
		await writeFile(
			join(guardDir, "codex.ps1"),
			`Write-Error "${NESTED_CODEX_GUARD_MESSAGE.replace(/"/g, '`"')}"\r\nexit 1\r\n`,
			"utf8",
		);
	} else {
		await writeFile(
			join(guardDir, "codex"),
			`#!/usr/bin/env sh\nprintf '%s\\n' 'ERROR: ${NESTED_CODEX_GUARD_MESSAGE}' >&2\nexit 1\n`,
			{ encoding: "utf8", mode: 0o755 },
		);
	}

	const nextEnv = { ...process.env };
	const pathKey = getPathEnvKey(nextEnv, process.platform);
	nextEnv[pathKey] = [guardDir, nextEnv[pathKey]].filter(Boolean).join(delimiter);
	return nextEnv;
}

function buildAutomatedQaBacklogCliPrefix(platform = process.platform): string {
	const invocation = getCliInvocation();
	const commandParts = [invocation.command, ...invocation.args];
	if (platform === "win32") {
		return commandParts
			.map((part) => `& ${quoteShellArg(part, platform)}`)
			.join(" ")
			.replace(/^& /, "");
	}
	return commandParts.map((part) => quoteShellArg(part, platform)).join(" ");
}

export function buildAutomatedQaCodexInvocation(
	codexCommand: string,
	projectRoot: string,
	platform = process.platform,
): AutomatedQaCommandInvocation {
	const resolvedCodexCommand = resolveAutomatedQaCodexCommandPath(codexCommand, platform);
	const args = [
		"exec",
		"-C",
		projectRoot,
		"--skip-git-repo-check",
		"--sandbox",
		"danger-full-access",
		"--config",
		DISABLE_MULTI_AGENT_CONFIG,
		"-",
	];
	if (platform === "win32") {
		const command = [
			quoteShellArg(resolvedCodexCommand, platform),
			...args.map((arg) => quoteShellArg(arg, platform)),
		].join(" ");
		return {
			command,
			args: [],
			shell: true,
		};
	}
	return {
		command: resolvedCodexCommand,
		args,
		shell: false,
	};
}

function buildAutomationQueueItem(
	taskId: string,
	config: NormalizedAutomatedQaConfig,
	triggerMatch?: AgentAutomationTriggerMatch,
): AgentAutomationQueueItem {
	const normalizedTaskId = taskId.trim();
	const triggerType = triggerMatch?.triggerType ?? config.triggerType;
	const triggerStatus = triggerMatch?.triggerStatus ?? config.triggerStatus;
	const triggerSignature = triggerMatch?.triggerSignature ?? `to:${triggerStatus}`;
	return {
		id: `${config.id}::${normalizedTaskId}::${triggerType}::${triggerSignature}`,
		taskId: normalizedTaskId,
		automationId: config.id,
		automationName: config.name,
		triggerType,
		triggerStatus,
		triggerSignature,
		queuedAt: new Date().toISOString(),
	};
}

export async function queueAutomatedQaTask(
	projectRoot: string,
	taskId: string,
	config?: NormalizedAutomatedQaConfig,
	triggerMatch?: AgentAutomationTriggerMatch,
): Promise<AutomatedQaState> {
	const normalizedTaskId = taskId.trim();
	const automation = config ?? normalizeAutomatedQaConfig(undefined);
	const queueItem = buildAutomationQueueItem(normalizedTaskId, automation, triggerMatch);
	let queueInserted = false;
	const nextState = await mutateAutomatedQaState(projectRoot, (state) => {
		if (
			state.activeRuns?.some(
				(entry) => entry.taskId === queueItem.taskId && entry.automationId === queueItem.automationId,
			) ||
			state.queuedRuns?.some(
				(entry) => entry.taskId === queueItem.taskId && entry.automationId === queueItem.automationId,
			)
		) {
			return state;
		}
		queueInserted = true;
		return {
			...state,
			queuedRuns: [...(state.queuedRuns ?? []), queueItem],
			lastError: undefined,
		};
	});
	if (queueInserted && nextState.queuedRuns?.some((entry) => entry.id === queueItem.id)) {
		await mutateAutomatedQaRuns(projectRoot, (runs) => {
			if (findLatestRunIndex(runs, normalizedTaskId, ["queued", "started"], queueItem.id) >= 0) {
				return runs;
			}
			return [...runs, createAutomatedQaRun(queueItem, automation)];
		});
		await appendAutomatedQaAuditEvent(
			projectRoot,
			queueItem,
			automation,
			"automation_run_queued",
			`Automation "${automation.name}" queued ${normalizedTaskId}`,
			{ workerPid: process.pid },
			new Date(queueItem.queuedAt),
		);
	}
	return nextState;
}

export async function removeQueuedAutomatedQaTask(
	projectRoot: string,
	taskId: string,
	queueEntryId?: string,
): Promise<AutomatedQaState> {
	return mutateAutomatedQaState(projectRoot, (state) => ({
		...state,
		queuedRuns: (state.queuedRuns ?? []).filter(
			(entry) => entry.taskId !== taskId || (queueEntryId ? entry.id !== queueEntryId : false),
		),
	}));
}

export async function markAutomatedQaRunSkipped(
	projectRoot: string,
	taskId: string,
	reason: string,
	queueEntryId?: string,
	queueItem?: AgentAutomationQueueItem,
	config?: NormalizedAutomatedQaConfig,
): Promise<AutomatedQaRunRecord[]> {
	const runs = await mutateAutomatedQaRuns(projectRoot, (runs) => {
		const nextRuns = [...runs];
		const runIndex = findLatestRunIndex(nextRuns, taskId, ["queued", "started"], queueEntryId);
		if (runIndex < 0) {
			return nextRuns;
		}
		const run = nextRuns[runIndex];
		if (!run) {
			return nextRuns;
		}
		nextRuns[runIndex] = {
			...run,
			status: "skipped",
			phase: "skipped",
			startedAt: run.startedAt ?? run.queuedAt,
			completedAt: new Date().toISOString(),
			lastHeartbeatAt: new Date().toISOString(),
			lastHeartbeatNote: reason,
			error: reason,
		};
		return nextRuns;
	});
	if (queueItem && config) {
		await appendAutomatedQaAuditEvent(
			projectRoot,
			queueItem,
			config,
			"automation_run_skipped",
			`Automation "${config.name}" skipped ${taskId}`,
			{ error: reason },
		);
	}
	return runs;
}

export async function resetAutomatedQaActiveState(
	projectRoot: string,
	reason = "Previous automated QA worker ended before completing the review",
): Promise<AutomatedQaState> {
	const current = await loadAutomatedQaState(projectRoot);
	const activeQueueItems = (current.activeRuns?.length ?? 0) > 0 ? (current.activeRuns ?? []) : current.activeTaskIds;
	if (activeQueueItems.length > 0) {
		await markAutomatedQaRunsAbandoned(projectRoot, activeQueueItems, reason);
	}
	return mutateAutomatedQaState(projectRoot, (state) => ({
		...state,
		activeRuns: [],
	}));
}

async function markAutomatedQaTaskActive(
	projectRoot: string,
	taskId: string,
	queueItem: AgentAutomationQueueItem,
	config: NormalizedAutomatedQaConfig,
): Promise<AutomatedQaState> {
	const state = await mutateAutomatedQaState(projectRoot, (state) => ({
		...state,
		queuedRuns: (state.queuedRuns ?? []).filter((entry) => entry.id !== queueItem.id),
		activeRuns: (state.activeRuns ?? []).some((entry) => entry.id === queueItem.id)
			? (state.activeRuns ?? [])
			: [...(state.activeRuns ?? []), queueItem],
		lastRunAt: new Date().toISOString(),
		lastError: undefined,
	}));
	await mutateAutomatedQaRuns(projectRoot, (runs) => {
		const nextRuns = [...runs];
		const runIndex = findLatestRunIndex(nextRuns, taskId, ["queued", "started"], queueItem.id);
		const startedAt = new Date().toISOString();
		if (runIndex >= 0) {
			const existing = nextRuns[runIndex];
			if (existing) {
				nextRuns[runIndex] = {
					...existing,
					status: "started",
					phase: "worker_claimed",
					startedAt: existing.startedAt ?? startedAt,
					lastHeartbeatAt: startedAt,
					lastHeartbeatNote: "Worker claimed task for review",
					workerPid: process.pid,
				};
			}
			return nextRuns;
		}
		return [
			...nextRuns,
			{
				...createAutomatedQaRun(queueItem, config),
				status: "started",
				phase: "worker_claimed",
				startedAt,
				lastHeartbeatAt: startedAt,
				lastHeartbeatNote: "Worker claimed task for review",
				workerPid: process.pid,
			},
		];
	});
	const occurredAt = new Date();
	await appendAutomatedQaAuditEvent(
		projectRoot,
		queueItem,
		config,
		"automation_run_dequeued",
		`Automation "${config.name}" dequeued ${taskId} for review`,
		{ workerPid: process.pid },
		occurredAt,
	);
	await appendAutomatedQaAuditEvent(
		projectRoot,
		queueItem,
		config,
		"automation_task_claimed",
		`Automation "${config.name}" claimed ${taskId} as "${config.reviewerAssignee}"`,
		{ workerPid: process.pid },
		occurredAt,
	);
	return state;
}

async function completeAutomatedQaTask(
	projectRoot: string,
	taskId: string,
	queueItem: AgentAutomationQueueItem,
	config: NormalizedAutomatedQaConfig,
	result: AutomatedQaRunResult,
	finalTaskStatus?: string,
): Promise<AutomatedQaState> {
	const state = await mutateAutomatedQaState(projectRoot, (state) => ({
		...state,
		activeRuns: (state.activeRuns ?? []).filter((entry) => entry.id !== queueItem.id),
		lastRunAt: new Date().toISOString(),
		lastCompletedTaskId: taskId,
		lastError: result.success ? undefined : (result.error ?? `Automated QA exited with code ${result.exitCode ?? 1}`),
		queuedRuns:
			result.success || result.requeue === false
				? (state.queuedRuns ?? []).filter((entry) => entry.id !== queueItem.id)
				: (state.queuedRuns ?? []).some((entry) => entry.id === queueItem.id)
					? (state.queuedRuns ?? [])
					: [{ ...queueItem, queuedAt: new Date().toISOString() }, ...(state.queuedRuns ?? [])],
	}));
	await mutateAutomatedQaRuns(projectRoot, (runs) => {
		const nextRuns = [...runs];
		const runIndex = findLatestRunIndex(nextRuns, taskId, ["queued", "started"], queueItem.id);
		const completedAt = new Date().toISOString();
		if (runIndex < 0) {
			return nextRuns;
		}
		const run = nextRuns[runIndex];
		if (!run) {
			return nextRuns;
		}
		nextRuns[runIndex] = {
			...run,
			status: result.success ? "succeeded" : "failed",
			phase: result.success ? "reviewer_completed" : "reviewer_failed",
			startedAt: run.startedAt ?? run.queuedAt,
			completedAt,
			lastHeartbeatAt: completedAt,
			lastHeartbeatNote: result.success
				? "Reviewer process completed successfully"
				: (result.error ?? `Reviewer process failed with exit code ${result.exitCode ?? 1}`),
			error: result.success ? undefined : (result.error ?? run.error),
			exitCode: result.exitCode,
			finalTaskStatus: finalTaskStatus ?? run.finalTaskStatus,
			stdoutExcerpt: result.stdoutExcerpt ?? run.stdoutExcerpt,
			stderrExcerpt: result.stderrExcerpt ?? run.stderrExcerpt,
			lastOutputAt: result.lastOutputAt ?? run.lastOutputAt,
			lastOutputSource: result.lastOutputSource ?? run.lastOutputSource,
			lastOutputExcerpt: result.lastOutputExcerpt ?? run.lastOutputExcerpt,
		};
		return nextRuns;
	});
	await appendAutomatedQaAuditEvent(
		projectRoot,
		queueItem,
		config,
		result.success ? "automation_run_succeeded" : "automation_run_failed",
		result.success
			? `Automation "${config.name}" completed review for ${taskId}`
			: `Automation "${config.name}" failed review for ${taskId}`,
		{
			exitCode: result.exitCode,
			finalTaskStatus: finalTaskStatus ?? "",
			...(result.error ? { error: result.error } : {}),
			...(result.lastOutputSource ? { lastOutputSource: result.lastOutputSource } : {}),
		},
	);
	return state;
}

export async function markAutomatedQaRunsAbandoned(
	projectRoot: string,
	queueItems: Array<AgentAutomationQueueItem | string>,
	reason: string,
): Promise<AutomatedQaRunRecord[]> {
	const normalizedItems = normalizeAutomationQueueItems(queueItems);
	if (normalizedItems.length === 0) {
		return loadAutomatedQaRuns(projectRoot);
	}
	const runs = await mutateAutomatedQaRuns(projectRoot, (runs) => {
		const completedAt = new Date().toISOString();
		return runs.map((run) => {
			const matchesQueueItem = normalizedItems.some((entry) =>
				run.queueEntryId ? entry.id === run.queueEntryId : entry.taskId === run.taskId,
			);
			if (!matchesQueueItem || !isOpenRunStatus(run.status)) {
				return run;
			}
			return {
				...run,
				status: "abandoned",
				phase: "abandoned",
				startedAt: run.startedAt ?? run.queuedAt,
				completedAt,
				lastHeartbeatAt: completedAt,
				lastHeartbeatNote: reason,
				error: reason,
			};
		});
	});
	for (const item of normalizedItems) {
		const run = runs
			.slice()
			.reverse()
			.find(
				(entry) =>
					entry.status === "abandoned" &&
					(entry.queueEntryId ? entry.queueEntryId === item.id : entry.taskId === item.taskId),
			);
		if (!run) {
			continue;
		}
		await appendAutomatedQaAuditEvent(
			projectRoot,
			{
				id: run.queueEntryId ?? item.id,
				taskId: run.taskId,
				automationId: run.automationId ?? item.automationId,
				automationName: run.automationName ?? item.automationName,
				triggerType: run.triggerType ?? item.triggerType,
				triggerStatus: run.triggerStatus,
				triggerSignature: run.triggerSignature ?? item.triggerSignature,
				queuedAt: run.queuedAt,
			},
			{
				id: run.automationId ?? item.automationId,
				name: run.automationName ?? item.automationName ?? run.automationId ?? item.automationId,
				agentName: run.agentName,
				reviewerAssignee: run.reviewerAssignee,
				codexCommand: run.codexCommand ?? DEFAULT_CODEX_COMMAND,
			},
			"automation_run_abandoned",
			`Automation "${run.automationName ?? item.automationName ?? run.automationId ?? item.automationId}" abandoned ${run.taskId}`,
			{
				error: reason,
				finalTaskStatus: run.finalTaskStatus ?? "",
				...(run.workerPid ? { workerPid: run.workerPid } : {}),
				...(run.codexPid ? { codexPid: run.codexPid } : {}),
			},
			new Date(run.completedAt ?? run.lastHeartbeatAt ?? run.startedAt ?? run.queuedAt),
		);
	}
	return runs;
}

export async function recordAutomatedQaProcessStarted(
	projectRoot: string,
	taskId: string,
	processStart: AutomatedQaProcessStart,
	queueEntryId?: string,
): Promise<AutomatedQaRunRecord[]> {
	const runs = await mutateAutomatedQaRuns(projectRoot, (runs) => {
		const nextRuns = [...runs];
		const runIndex = findLatestRunIndex(nextRuns, taskId, ["started", "queued"], queueEntryId);
		if (runIndex < 0) {
			return nextRuns;
		}
		const run = nextRuns[runIndex];
		if (!run) {
			return nextRuns;
		}
		nextRuns[runIndex] = {
			...run,
			status: "started",
			phase: "reviewer_launching",
			startedAt: run.startedAt ?? processStart.startedAt,
			lastHeartbeatAt: processStart.startedAt,
			lastHeartbeatNote: "Reviewer process launched",
			workerPid: run.workerPid ?? process.pid,
			codexPid: processStart.pid,
			codexCommand: [processStart.command, ...processStart.args].join(" "),
		};
		return nextRuns;
	});
	const run = runs
		.slice()
		.reverse()
		.find((entry) => entry.taskId === taskId && (!queueEntryId || entry.queueEntryId === queueEntryId));
	if (run) {
		await appendAutomatedQaRunRecordAuditEvent(
			projectRoot,
			run,
			"automation_reviewer_started",
			`Automation "${run.automationName ?? run.automationId ?? DEFAULT_AUTOMATION_NAME}" reviewer process started for ${taskId}`,
			{
				workerPid: run.workerPid ?? process.pid,
				codexPid: processStart.pid,
				command: processStart.command,
				args: processStart.args,
			},
			new Date(processStart.startedAt),
		);
	}
	return runs;
}

export async function recordAutomatedQaHeartbeat(
	projectRoot: string,
	taskId: string,
	event: AutomatedQaHeartbeatEvent,
	queueEntryId?: string,
): Promise<AutomatedQaRunRecord[]> {
	return mutateAutomatedQaRuns(projectRoot, (runs) => {
		const nextRuns = [...runs];
		const runIndex = findLatestRunIndex(nextRuns, taskId, ["started", "queued"], queueEntryId);
		if (runIndex < 0) {
			return nextRuns;
		}
		const run = nextRuns[runIndex];
		if (!run) {
			return nextRuns;
		}
		nextRuns[runIndex] = {
			...run,
			phase: event.phase,
			lastHeartbeatAt: event.timestamp,
			lastHeartbeatNote: event.note,
		};
		return nextRuns;
	});
}

export async function recordAutomatedQaOutput(
	projectRoot: string,
	taskId: string,
	event: AutomatedQaOutputEvent,
	queueEntryId?: string,
): Promise<AutomatedQaRunRecord[]> {
	const runs = await mutateAutomatedQaRuns(projectRoot, (runs) => {
		const nextRuns = [...runs];
		const runIndex = findLatestRunIndex(nextRuns, taskId, ["started", "queued"], queueEntryId);
		if (runIndex < 0) {
			return nextRuns;
		}
		const run = nextRuns[runIndex];
		if (!run) {
			return nextRuns;
		}
		const nextStdout =
			event.source === "stdout" ? appendAutomatedQaOutputExcerpt(run.stdoutExcerpt, event.chunk) : run.stdoutExcerpt;
		const nextStderr =
			event.source === "stderr" ? appendAutomatedQaOutputExcerpt(run.stderrExcerpt, event.chunk) : run.stderrExcerpt;
		nextRuns[runIndex] = {
			...run,
			phase: run.phase ?? "reviewer_running",
			lastOutputAt: event.timestamp,
			lastOutputSource: event.source,
			lastOutputExcerpt: trimAutomatedQaOutputTail(
				normalizeAutomatedQaOutputChunk(event.chunk),
				AUTOMATED_QA_LAST_OUTPUT_MAX_LENGTH,
			),
			stdoutExcerpt: nextStdout,
			stderrExcerpt: nextStderr,
		};
		return nextRuns;
	});
	const run = runs
		.slice()
		.reverse()
		.find((entry) => entry.taskId === taskId && (!queueEntryId || entry.queueEntryId === queueEntryId));
	if (run) {
		await appendAutomatedQaRunRecordAuditEvent(
			projectRoot,
			run,
			"automation_reviewer_output",
			`Automation "${run.automationName ?? run.automationId ?? DEFAULT_AUTOMATION_NAME}" captured reviewer ${event.source} output for ${taskId}`,
			{
				outputSource: event.source,
				outputExcerpt: trimAutomatedQaOutputTail(
					normalizeAutomatedQaOutputChunk(event.chunk),
					AUTOMATED_QA_LAST_OUTPUT_MAX_LENGTH,
				),
			},
			new Date(event.timestamp),
		);
	}
	return runs;
}

export async function listRecentAutomatedQaRuns(projectRoot: string, limit = 20): Promise<AutomatedQaRunRecord[]> {
	const runs = await loadAutomatedQaRuns(projectRoot);
	return runs.slice(-limit).reverse();
}

function getCliInvocation(): { command: string; args: string[] } {
	const [argv0, argv1] = process.argv;
	const command = argv0 || process.execPath;
	const cliScriptPath = fileURLToPath(new URL("../cli.ts", import.meta.url));
	if (argv1 && /(\.(c|m)?js|\.ts)$/i.test(argv1)) {
		return {
			command,
			args: [cliScriptPath],
		};
	}
	return {
		command,
		args: [],
	};
}

export function buildAutomatedQaPrompt(
	task: Task,
	agentName: string,
	reviewerAssignee: string,
	promptTemplate?: string,
): string {
	const backlogCliPrefix = buildAutomatedQaBacklogCliPrefix();
	const customPrompt = compactPromptText(promptTemplate, 4000);
	return [
		`Review backlog task ${task.id} "${task.title}" as the QA gate for this project.`,
		"",
		`Reviewer identity hint: "${agentName}". Perform the QA review directly in this run; do not spawn another Codex reviewer or inspect agent configuration unless the task explicitly requires it.`,
		...(customPrompt ? ["", "Project automation prompt:", customPrompt] : []),
		"",
		buildAutomatedQaTaskSnapshot(task),
		"",
		"Required workflow:",
		"- Delegation is forbidden. Do not call spawn_agent, codex exec, or any equivalent nested reviewer launch path.",
		"- Read the task from backlog first and use backlog as the source of truth; use the snapshot above only as a convenience.",
		"- Use shell commands only for this automated QA run.",
		"- Do not use apply_patch or any direct file-editing tool during this automated QA run.",
		"- Do not inspect Backlog.md source, .codex agent files, or other automation internals unless the task explicitly requires that evidence.",
		"- Stay focused on the target task, its governing docs, and the evidence needed for a QA verdict.",
		`- Use this exact Backlog.md CLI prefix for backlog reads and writes: ${backlogCliPrefix}`,
		`- Read the task with: ${backlogCliPrefix} task ${task.id} --plain`,
		`- While reviewing, ensure the task assignee is "${reviewerAssignee}" so active QA ownership is visible in backlog state.`,
		"- Validate acceptance criteria, tests, and documentation alignment.",
		"- Look for bugs, regressions, missing coverage, and contract drift.",
		"- Do not implement feature work; this is a QA review pass.",
		"- Reach a status decision as soon as the evidence is sufficient; avoid exploratory repo spelunking.",
		"- Once you have written the backlog verdict and status update, stop immediately.",
		"- Do not offer next steps, extra help, or additional review after the verdict is recorded.",
		`- If the task passes QA, move it to Done with a shell command like: ${backlogCliPrefix} task edit ${task.id} -s Done --append-notes "<qa summary>" --plain`,
		`- If the task fails QA, move it to In Progress with a shell command like: ${backlogCliPrefix} task edit ${task.id} -s "In Progress" --append-notes "<findings>" --plain`,
		`- If the task is blocked by an external dependency, move it to Blocked with a shell command like: ${backlogCliPrefix} task edit ${task.id} -s Blocked --append-notes "<blocker>" --plain`,
		"",
		"Keep the review operational and evidence-driven.",
	].join("\n");
}

async function queueExistingTriggerStatusTasks(core: Core, automations: NormalizedAutomatedQaConfig[]): Promise<void> {
	const tasks = await core.fs.listTasks();
	for (const automation of automations) {
		if (!automation.enabled || automation.paused || automation.triggerType !== "status_transition") {
			continue;
		}
		for (const task of tasks) {
			const triggerMatch = findAgentAutomationTriggerMatch(undefined, task, automation);
			if (triggerMatch) {
				await queueAutomatedQaTask(core.filesystem.rootDir, task.id, automation, triggerMatch);
			}
		}
	}
}

async function claimAutomatedQaTask(
	core: Core,
	taskId: string,
	reviewerAssignee: string,
	queueItem: AgentAutomationQueueItem,
	automation: NormalizedAutomatedQaConfig,
): Promise<void> {
	const task = await loadAutomatedQaTaskFromDisk(core, taskId);
	if (!task) {
		return;
	}
	const normalizedCurrent = (task.assignee ?? []).map((value) => value.trim()).filter(Boolean);
	const currentReviewer = normalizedCurrent.at(0);
	if (
		normalizedCurrent.length === 1 &&
		currentReviewer &&
		currentReviewer.toLowerCase() === reviewerAssignee.toLowerCase()
	) {
		return;
	}
	await core.updateTaskFromInput(
		taskId,
		{ assignee: [reviewerAssignee] },
		undefined,
		buildAutomatedQaAuditActor(automation, queueItem.id),
	);
}

export const runAutomatedQaWithCodex: AutomatedQaRunner = async ({
	projectRoot,
	taskId: _taskId,
	prompt,
	codexCommand,
	timeoutSeconds,
	onProcessStarted,
	onHeartbeat,
	onOutput,
}: AutomatedQaRunnerOptions) => {
	const reviewerEnv = await buildAutomatedQaReviewerEnv(projectRoot);
	return await new Promise((resolve) => {
		const timeoutMs = normalizeAutomatedQaTimeoutSeconds(timeoutSeconds) * 1000;
		let settled = false;
		let stdoutExcerpt: string | undefined;
		let stderrExcerpt: string | undefined;
		let lastOutputAt: string | undefined;
		let lastOutputSource: "stdout" | "stderr" | undefined;
		let lastOutputExcerpt: string | undefined;
		const invocation = buildAutomatedQaCodexInvocation(codexCommand, projectRoot);
		const child = spawn(invocation.command, invocation.args, {
			cwd: projectRoot,
			env: reviewerEnv,
			shell: invocation.shell,
			stdio: ["pipe", "pipe", "pipe"],
			windowsHide: true,
		});
		let processScanTimer: ReturnType<typeof setInterval> | undefined;
		let scanningProcesses = false;
		const finish = (result: AutomatedQaRunResult) => {
			if (settled) {
				return;
			}
			settled = true;
			if (processScanTimer) {
				clearInterval(processScanTimer);
			}
			if (heartbeatTimer) {
				clearInterval(heartbeatTimer);
			}
			if (timeoutTimer) {
				clearTimeout(timeoutTimer);
			}
			resolve(result);
		};
		const recordOutput = (source: "stdout" | "stderr", chunk: string) => {
			const timestamp = new Date().toISOString();
			const normalizedChunk = normalizeAutomatedQaOutputChunk(chunk);
			if (!normalizedChunk.trim()) {
				return;
			}
			if (source === "stdout") {
				stdoutExcerpt = appendAutomatedQaOutputExcerpt(stdoutExcerpt, normalizedChunk);
			} else {
				stderrExcerpt = appendAutomatedQaOutputExcerpt(stderrExcerpt, normalizedChunk);
			}
			lastOutputAt = timestamp;
			lastOutputSource = source;
			lastOutputExcerpt = trimAutomatedQaOutputTail(normalizedChunk, AUTOMATED_QA_LAST_OUTPUT_MAX_LENGTH);
			if (onOutput) {
				void Promise.resolve(
					onOutput({
						timestamp,
						source,
						chunk: normalizedChunk,
					}),
				).catch(() => {});
			}
		};
		if (child.pid && onProcessStarted) {
			void Promise.resolve(
				onProcessStarted({
					pid: child.pid,
					startedAt: new Date().toISOString(),
					command: invocation.command,
					args: invocation.args,
				}),
			).catch(() => {});
		}
		const scanForNestedCodexDescendants = async () => {
			if (settled || scanningProcesses || !child.pid) {
				return;
			}
			scanningProcesses = true;
			try {
				const nestedCodex = await findNestedCodexDescendantProcess(child.pid);
				if (!nestedCodex) {
					return;
				}
				const nestedDetails =
					nestedCodex.commandLine?.trim() ||
					nestedCodex.executablePath?.trim() ||
					nestedCodex.name?.trim() ||
					`pid ${nestedCodex.pid}`;
				const guardError = `Automated QA reviewer attempted a nested Codex launch blocked by the runtime guard: ${NESTED_CODEX_GUARD_MESSAGE}`;
				const guardOutput = `ERROR: ${NESTED_CODEX_GUARD_MESSAGE} Descendant PID ${nestedCodex.pid}: ${nestedDetails}`;
				stderrExcerpt = appendAutomatedQaOutputExcerpt(stderrExcerpt, guardOutput);
				lastOutputAt = new Date().toISOString();
				lastOutputSource = "stderr";
				lastOutputExcerpt = trimAutomatedQaOutputTail(guardOutput, AUTOMATED_QA_LAST_OUTPUT_MAX_LENGTH);
				await killAutomatedQaProcessTree(nestedCodex.pid);
				await killAutomatedQaProcessTree(child.pid);
				finish({
					success: false,
					exitCode: 1,
					error: guardError,
					stdoutExcerpt,
					stderrExcerpt,
					lastOutputAt,
					lastOutputSource,
					lastOutputExcerpt,
				});
			} finally {
				scanningProcesses = false;
			}
		};
		let heartbeatTimer: ReturnType<typeof setInterval> | undefined;
		let timeoutTimer: ReturnType<typeof setTimeout> | undefined;
		const emitHeartbeat = (note: string) => {
			if (!onHeartbeat) {
				return;
			}
			void Promise.resolve(
				onHeartbeat({
					timestamp: new Date().toISOString(),
					phase: "reviewer_running",
					note,
				}),
			).catch(() => {});
		};
		emitHeartbeat("Reviewer process is running");
		void scanForNestedCodexDescendants();
		processScanTimer = setInterval(() => {
			void scanForNestedCodexDescendants();
		}, AUTOMATED_QA_PROCESS_SCAN_INTERVAL_MS);
		heartbeatTimer = setInterval(() => {
			emitHeartbeat("Reviewer process is still running");
		}, AUTOMATED_QA_HEARTBEAT_INTERVAL_MS);
		timeoutTimer = setTimeout(() => {
			void Promise.resolve(
				onHeartbeat?.({
					timestamp: new Date().toISOString(),
					phase: "reviewer_failed",
					note: `Reviewer process exceeded the ${Math.floor(timeoutMs / 1000)}s timeout and was terminated`,
				}),
			).catch(() => {});
			child.kill();
			finish({
				success: false,
				error: `Automated QA reviewer timed out after ${Math.floor(timeoutMs / 1000)}s`,
				stdoutExcerpt,
				stderrExcerpt,
				lastOutputAt,
				lastOutputSource,
				lastOutputExcerpt,
			});
		}, timeoutMs);

		let stderr = "";
		child.stdout.on("data", (chunk) => {
			recordOutput("stdout", String(chunk));
		});
		child.stderr.on("data", (chunk) => {
			const chunkText = String(chunk);
			stderr += chunkText;
			recordOutput("stderr", chunkText);
		});
		child.on("error", (error) => {
			finish({
				success: false,
				error: error.message,
				stdoutExcerpt,
				stderrExcerpt,
				lastOutputAt,
				lastOutputSource,
				lastOutputExcerpt,
			});
		});
		child.on("close", (exitCode) => {
			finish({
				success: exitCode === 0,
				exitCode: exitCode ?? undefined,
				error: exitCode === 0 ? undefined : stderr.trim() || `Codex exited with code ${exitCode ?? 1}`,
				stdoutExcerpt,
				stderrExcerpt,
				lastOutputAt,
				lastOutputSource,
				lastOutputExcerpt,
			});
		});

		child.stdin.write(`${prompt}\n`);
		child.stdin.end();
	});
};

export async function spawnAutomatedQaWorker(projectRoot: string): Promise<boolean> {
	const existingLock = await loadWorkerLock(projectRoot);
	if (existingLock && isProcessRunning(existingLock.pid)) {
		return false;
	}
	const invocation = getCliInvocation();
	const child = spawn(invocation.command, [...invocation.args, "qa-worker", "--project-root", projectRoot], {
		cwd: projectRoot,
		detached: true,
		stdio: "ignore",
		windowsHide: true,
	});
	child.unref();
	return true;
}

export async function handleAutomatedQaStatusChange(
	core: Core,
	task: Task,
	oldStatus: string,
	newStatus: string,
): Promise<void> {
	await handleAutomatedQaTaskChange(
		core,
		{
			...task,
			status: oldStatus,
		},
		{
			...task,
			status: newStatus,
		},
	);
}

export async function handleAutomatedQaTaskChange(
	core: Core,
	previousTask: Task | undefined,
	task: Task,
): Promise<void> {
	const config = await core.filesystem.loadConfig();
	const automations = normalizeAgentAutomationConfigs(config?.agentAutomations, config?.automatedQa);
	let shouldSpawnWorker = false;
	for (const automation of automations) {
		if (!automation.enabled) {
			continue;
		}
		const triggerMatch = findAgentAutomationTriggerMatch(previousTask, task, automation);
		if (!triggerMatch) {
			continue;
		}
		await queueAutomatedQaTask(core.filesystem.rootDir, task.id, automation, triggerMatch);
		if (!automation.paused) {
			shouldSpawnWorker = true;
		}
	}
	if (!shouldSpawnWorker) {
		return;
	}
	await spawnAutomatedQaWorker(core.filesystem.rootDir);
}

function getActiveRunCountForAutomation(state: AutomatedQaState, automationId: string): number {
	return (state.activeRuns ?? []).filter((entry) => entry.automationId === automationId).length;
}

function findNextQueueItem(
	state: AutomatedQaState,
	automations: NormalizedAutomatedQaConfig[],
): { queueItem: AgentAutomationQueueItem; automation: NormalizedAutomatedQaConfig } | null {
	for (const queueItem of state.queuedRuns ?? []) {
		if ((state.activeRuns ?? []).some((entry) => entry.id === queueItem.id)) {
			continue;
		}
		const automation = automations.find((entry) => entry.id === queueItem.automationId);
		if (!automation || !automation.enabled || automation.paused) {
			continue;
		}
		if (getActiveRunCountForAutomation(state, automation.id) >= automation.maxConcurrentRuns) {
			continue;
		}
		return { queueItem, automation };
	}
	return null;
}

function buildPausedAutomationConfigUpdate(
	config: BacklogConfig,
	automation: NormalizedAutomatedQaConfig,
): BacklogConfig {
	const agentAutomations = normalizeAgentAutomationConfigs(config.agentAutomations, config.automatedQa).map((entry) =>
		toAgentAutomationConfig(entry.id === automation.id ? { ...entry, paused: true } : entry),
	);
	return {
		...config,
		agentAutomations,
		automatedQa:
			automation.id === DEFAULT_AUTOMATION_ID
				? {
						...config.automatedQa,
						paused: true,
					}
				: config.automatedQa,
	};
}

export async function drainAutomatedQaQueue(
	core: Core,
	options: {
		runner?: AutomatedQaRunner;
	} = {},
): Promise<{ processedTaskIds: string[]; skippedTaskIds: string[] }> {
	const runner = options.runner ?? runAutomatedQaWithCodex;
	const projectRoot = core.filesystem.rootDir;
	const processedTaskIds: string[] = [];
	const skippedTaskIds: string[] = [];

	for (;;) {
		const config = await core.filesystem.loadConfig();
		const automations = normalizeAgentAutomationConfigs(config?.agentAutomations, config?.automatedQa);
		const hasActiveAutomation = automations.some((automation) => automation.enabled && !automation.paused);
		if (!hasActiveAutomation) {
			break;
		}
		await queueExistingTriggerStatusTasks(core, automations);

		const state = await loadAutomatedQaState(projectRoot);
		const nextRun = findNextQueueItem(state, automations);
		if (!nextRun) {
			break;
		}
		const { queueItem, automation: automatedQa } = nextRun;
		const nextTaskId = queueItem.taskId;

		const task = await core.getTask(nextTaskId);
		const triggerMatch = task ? findAgentAutomationTriggerMatch(undefined, task, automatedQa) : null;
		if (!task || !triggerMatch) {
			skippedTaskIds.push(nextTaskId);
			await removeQueuedAutomatedQaTask(projectRoot, nextTaskId, queueItem.id);
			await markAutomatedQaRunSkipped(
				projectRoot,
				nextTaskId,
				`Task no longer matched the automated QA trigger when the worker attempted to start it. Automation: "${automatedQa.name}".`,
				queueItem.id,
				queueItem,
				automatedQa,
			);
			continue;
		}

		await markAutomatedQaTaskActive(projectRoot, nextTaskId, queueItem, automatedQa);
		await claimAutomatedQaTask(core, nextTaskId, automatedQa.reviewerAssignee, queueItem, automatedQa);
		await appendAutomatedQaActivityNote(
			core,
			nextTaskId,
			`Automated QA review started at ${formatLocalTimestamp(new Date())} with agent "${automatedQa.agentName}". Automation "${automatedQa.name}" via ${queueItem.triggerType} (${queueItem.triggerSignature}). Assignee claimed as "${automatedQa.reviewerAssignee}".`,
			buildAutomatedQaAuditActor(automatedQa, queueItem.id),
		);
		await appendAutomatedQaAuditEvent(
			projectRoot,
			queueItem,
			automatedQa,
			"automation_reviewer_launching",
			`Automation "${automatedQa.name}" is launching reviewer "${automatedQa.agentName}" for ${nextTaskId}`,
			{ workerPid: process.pid },
		);
		const result = await runner({
			projectRoot,
			taskId: nextTaskId,
			prompt: buildAutomatedQaPrompt(
				task,
				automatedQa.agentName,
				automatedQa.reviewerAssignee,
				automatedQa.promptTemplate,
			),
			codexCommand: automatedQa.codexCommand,
			timeoutSeconds: automatedQa.timeoutSeconds,
			onProcessStarted: async (processStart) => {
				await recordAutomatedQaProcessStarted(projectRoot, nextTaskId, processStart, queueItem.id);
				await appendAutomatedQaActivityNote(
					core,
					nextTaskId,
					`Automated QA reviewer process launched at ${formatLocalTimestamp(processStart.startedAt)}. Automation "${automatedQa.name}". Worker PID ${process.pid}; reviewer PID ${processStart.pid}.`,
					buildAutomatedQaAuditActor(automatedQa, queueItem.id),
				);
			},
			onHeartbeat: async (event) => {
				await recordAutomatedQaHeartbeat(projectRoot, nextTaskId, event, queueItem.id);
			},
			onOutput: async (event) => {
				await recordAutomatedQaOutput(projectRoot, nextTaskId, event, queueItem.id);
			},
		});
		const finalTask = await loadAutomatedQaTerminalTaskState(core, nextTaskId, automatedQa.triggerStatus);
		const finalizedResult = finalizeAutomatedQaRunResult(result, finalTask?.status, automatedQa.triggerStatus);
		if (finalizedResult.pauseQueue && config) {
			await core.filesystem.saveConfig(buildPausedAutomationConfigUpdate(config, automatedQa));
			await appendAutomatedQaAuditEvent(
				projectRoot,
				queueItem,
				automatedQa,
				"automation_queue_paused",
				`Automation "${automatedQa.name}" queue paused after a failed reviewer run`,
				{
					finalTaskStatus: finalTask?.status ?? "",
					...(finalizedResult.error ? { error: finalizedResult.error } : {}),
				},
			);
		}
		await completeAutomatedQaTask(projectRoot, nextTaskId, queueItem, automatedQa, finalizedResult, finalTask?.status);
		const completionSummary = finalizedResult.success
			? `Automated QA review completed at ${formatLocalTimestamp(new Date())} with a successful reviewer exit. Automation "${automatedQa.name}". Final task status: ${finalTask?.status ?? "unknown"}.`
			: `Automated QA review attempt failed at ${formatLocalTimestamp(new Date())} with ${
					finalizedResult.error ?? `exit code ${finalizedResult.exitCode ?? 1}`
				}. Automation "${automatedQa.name}". Final task status: ${finalTask?.status ?? "unknown"}.`;
		await appendAutomatedQaActivityNote(
			core,
			nextTaskId,
			completionSummary,
			buildAutomatedQaAuditActor(automatedQa, queueItem.id),
		);
		if (!finalizedResult.success) {
			break;
		}
		processedTaskIds.push(nextTaskId);
	}

	return {
		processedTaskIds,
		skippedTaskIds,
	};
}
