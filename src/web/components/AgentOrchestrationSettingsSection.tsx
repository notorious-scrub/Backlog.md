import React from "react";
import type {
	AgentAutomationConfig,
	AgentAutomationQueueItem,
	AutomatedQaRunRecord,
	AutomatedQaState,
	BacklogConfig,
	TaskAuditEvent,
} from "../../types";
import { formatAuditActor, formatAuditEventType, formatAuditValue } from "../utils/audit-log-display";

type HandleInputChange = <K extends keyof BacklogConfig>(field: K, value: BacklogConfig[K]) => void;

interface AgentOrchestrationSettingsSectionProps {
	config: BacklogConfig;
	validationErrors: Record<string, string>;
	automatedQaState: AutomatedQaState;
	automatedQaRuns: AutomatedQaRunRecord[];
	automatedQaStaleThresholdMs: number;
	automationAuditEvents: TaskAuditEvent[];
	automationAuditError: string | null;
	handleInputChange: HandleInputChange;
	getAutomationById: (automationId: string | undefined) => AgentAutomationConfig | undefined;
	formatQueueItemLabel: (entry: AgentAutomationQueueItem) => string;
	formatAutomatedQaTimestamp: (value: string | undefined) => string;
	isAutomatedQaRunStale: (run: AutomatedQaRunRecord) => boolean;
	formatAutomatedQaPhase: (phase: AutomatedQaRunRecord["phase"]) => string;
	formatAutomatedQaOutput: (value: string | undefined) => string;
}

const AgentOrchestrationSettingsSection: React.FC<AgentOrchestrationSettingsSectionProps> = ({
	config,
	validationErrors,
	automatedQaState,
	automatedQaRuns,
	automatedQaStaleThresholdMs,
	automationAuditEvents,
	automationAuditError,
	handleInputChange,
	getAutomationById,
	formatQueueItemLabel,
	formatAutomatedQaTimestamp,
	isAutomatedQaRunStale,
	formatAutomatedQaPhase,
	formatAutomatedQaOutput,
}) => {
	return (
		<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
			<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Automated QA</h2>
			<p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
				Automatically enqueue and launch Codex QA reviews when tasks move into a configured status such as <code>QA</code>.
			</p>
			<div className="space-y-4">
				<div>
					<label className="flex items-center justify-between">
						<div>
							<span className="text-sm font-medium text-gray-700 dark:text-gray-300">Enable automated QA</span>
							<p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
								When enabled, supported task status changes can trigger automatic Codex QA reviews.
							</p>
						</div>
						<div className="relative inline-flex items-center cursor-pointer">
							<input
								type="checkbox"
								checked={Boolean(config.automatedQa?.enabled)}
								onChange={(e) =>
									handleInputChange("automatedQa", {
										...config.automatedQa,
										enabled: e.target.checked,
									})
								}
								className="sr-only peer"
							/>
							<div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-circle peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-circle after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
						</div>
					</label>
				</div>

				<div>
					<label className="flex items-center justify-between">
						<div>
							<span className="text-sm font-medium text-gray-700 dark:text-gray-300">Pause automatic spawning</span>
							<p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
								When paused, tasks are queued instead of launching Codex immediately. Resuming drains the queue.
							</p>
						</div>
						<div className="relative inline-flex items-center cursor-pointer">
							<input
								type="checkbox"
								checked={Boolean(config.automatedQa?.paused)}
								disabled={!config.automatedQa?.enabled}
								onChange={(e) =>
									handleInputChange("automatedQa", {
										...config.automatedQa,
										paused: e.target.checked,
									})
								}
								className="sr-only peer"
							/>
							<div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-circle peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-circle after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500 disabled:opacity-50"></div>
						</div>
					</label>
				</div>

				<div>
					<label htmlFor="automatedQaTriggerStatus" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
						Trigger Status
					</label>
					<select
						id="automatedQaTriggerStatus"
						value={config.automatedQa?.triggerStatus ?? "QA"}
						disabled={!config.automatedQa?.enabled}
						onChange={(e) =>
							handleInputChange("automatedQa", {
								...config.automatedQa,
								triggerStatus: e.target.value,
							})
						}
						className={`w-full h-10 px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200 ${
							validationErrors.automatedQaTriggerStatus
								? "border-red-500 dark:border-red-400"
								: "border-gray-300 dark:border-gray-600"
						}`}
					>
						{Array.from(new Set([...(config.statuses ?? []), config.automatedQa?.triggerStatus ?? "QA"])).map((status) => (
							<option key={status} value={status}>
								{status}
							</option>
						))}
					</select>
					{validationErrors.automatedQaTriggerStatus && (
						<p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.automatedQaTriggerStatus}</p>
					)}
				</div>

				<div className="grid gap-4 md:grid-cols-2">
					<div>
						<label htmlFor="automatedQaCodexCommand" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Codex Command
						</label>
						<input
							id="automatedQaCodexCommand"
							type="text"
							value={config.automatedQa?.codexCommand ?? "codex"}
							disabled={!config.automatedQa?.enabled}
							onChange={(e) =>
								handleInputChange("automatedQa", {
									...config.automatedQa,
									codexCommand: e.target.value,
								})
							}
							className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200"
						/>
					</div>
					<div>
						<label htmlFor="automatedQaReviewerAssignee" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Reviewer Assignee
						</label>
						<input
							id="automatedQaReviewerAssignee"
							type="text"
							value={config.automatedQa?.reviewerAssignee ?? "QA"}
							disabled={!config.automatedQa?.enabled}
							onChange={(e) =>
								handleInputChange("automatedQa", {
									...config.automatedQa,
									reviewerAssignee: e.target.value,
								})
							}
							className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200"
						/>
						<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
							Active automated QA runs claim the task with this assignee while review is underway.
						</p>
					</div>
					<div>
						<label htmlFor="automatedQaTimeoutSeconds" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							Timeout Seconds
						</label>
						<input
							id="automatedQaTimeoutSeconds"
							type="number"
							min={30}
							max={7200}
							step={1}
							value={config.automatedQa?.timeoutSeconds ?? 180}
							disabled={!config.automatedQa?.enabled}
							onChange={(e) =>
								handleInputChange("automatedQa", {
									...config.automatedQa,
									timeoutSeconds: Number(e.target.value),
								})
							}
							className={`w-full px-3 py-2 border rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200 ${
								validationErrors.automatedQaTimeoutSeconds
									? "border-red-500 dark:border-red-400"
									: "border-gray-300 dark:border-gray-600"
							}`}
						/>
						<p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
							Set how long an automated reviewer may run before Backlog.md terminates it and re-queues the task.
						</p>
						{validationErrors.automatedQaTimeoutSeconds && (
							<p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.automatedQaTimeoutSeconds}</p>
						)}
					</div>
					<div>
						<label htmlFor="automatedQaAgentName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
							QA Subagent Name
						</label>
						<input
							id="automatedQaAgentName"
							type="text"
							value={config.automatedQa?.agentName ?? "qa_engineer"}
							disabled={!config.automatedQa?.enabled}
							onChange={(e) =>
								handleInputChange("automatedQa", {
									...config.automatedQa,
									agentName: e.target.value,
								})
							}
							className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200"
						/>
					</div>
				</div>

				<div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-4">
					<h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">Agent Automations</h3>
					<p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
						Named automation registry loaded from <code>agent_automations</code>. The first entry is kept in sync with
						the Automated QA compatibility fields above.
					</p>
					<div className="space-y-3">
						{(config.agentAutomations ?? []).map((automation, index) => {
							const triggerSummary =
								automation.trigger?.type === "label_added"
									? `label_added: ${(automation.trigger?.addedLabelsAny ?? []).join(", ") || "no labels configured"}`
									: `status_transition: ${(automation.trigger?.fromStatus ?? "*").trim() || "*"} -> ${
											automation.trigger?.toStatus?.trim() || "QA"
										}`;
							return (
								<div
									key={automation.id ?? `automation-${index}`}
									className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-3"
								>
									<div className="flex flex-wrap items-center gap-2">
										<span className="font-medium text-gray-900 dark:text-gray-100">
											{automation.name ?? automation.id ?? `Automation ${index + 1}`}
										</span>
										<span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-200">
											{automation.id ?? `automation-${index + 1}`}
										</span>
										<span
											className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
												automation.enabled
													? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
													: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
											}`}
										>
											{automation.enabled ? "enabled" : "disabled"}
										</span>
										<span
											className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
												automation.paused
													? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
													: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
											}`}
										>
											{automation.paused ? "paused" : "draining"}
										</span>
									</div>
									<div className="mt-2 grid gap-2 text-xs text-gray-500 dark:text-gray-400 md:grid-cols-2">
										<span>Trigger: {triggerSummary}</span>
										<span>Assignee: {automation.reviewerAssignee ?? "QA"}</span>
										<span>Agent: {automation.agentName ?? "qa_engineer"}</span>
										<span>Command: {automation.codexCommand ?? "codex"}</span>
										<span>Timeout: {automation.timeoutSeconds ?? 180}s</span>
										<span>Max concurrency: {automation.maxConcurrentRuns ?? 1}</span>
									</div>
									{automation.promptTemplate && (
										<p className="mt-2 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
											Prompt template: {automation.promptTemplate}
										</p>
									)}
								</div>
							);
						})}
					</div>
				</div>

				<div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-4">
					<h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">Queue State</h3>
					<p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
						Queued tasks wait for the automated QA worker. Active tasks are currently being reviewed.
					</p>
					<div className="grid gap-4 md:grid-cols-2">
						<div>
							<p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Queued</p>
							<div className="flex flex-wrap gap-2">
								{(automatedQaState.queuedRuns?.length ?? 0) > 0 || automatedQaState.queuedTaskIds.length > 0 ? (
									(automatedQaState.queuedRuns?.length
										? automatedQaState.queuedRuns
										: automatedQaState.queuedTaskIds.map((taskId) => ({
												id: `legacy-${taskId}`,
												taskId,
												automationId: "automated-qa",
												automationName: "Automated QA",
												triggerType: "status_transition" as const,
												triggerStatus: config.automatedQa?.triggerStatus ?? "QA",
												triggerSignature: `to:${config.automatedQa?.triggerStatus ?? "QA"}`,
												queuedAt: automatedQaState.lastRunAt ?? "",
											}))
									).map((entry) => (
										<span
											key={`queued-${entry.id}`}
											className="inline-flex items-center rounded-full bg-amber-100 px-2.5 py-1 text-xs font-medium text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
										>
											{formatQueueItemLabel(entry)}
										</span>
									))
								) : (
									<span className="text-sm text-gray-500 dark:text-gray-400">No queued tasks</span>
								)}
							</div>
						</div>
						<div>
							<p className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2">Active</p>
							<div className="flex flex-wrap gap-2">
								{(automatedQaState.activeRuns?.length ?? 0) > 0 || automatedQaState.activeTaskIds.length > 0 ? (
									(automatedQaState.activeRuns?.length
										? automatedQaState.activeRuns
										: automatedQaState.activeTaskIds.map((taskId) => ({
												id: `legacy-${taskId}`,
												taskId,
												automationId: "automated-qa",
												automationName: "Automated QA",
												triggerType: "status_transition" as const,
												triggerStatus: config.automatedQa?.triggerStatus ?? "QA",
												triggerSignature: `to:${config.automatedQa?.triggerStatus ?? "QA"}`,
												queuedAt: automatedQaState.lastRunAt ?? "",
											}))
									).map((entry) => (
										<span
											key={`active-${entry.id}`}
											className="inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-medium text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
										>
											{formatQueueItemLabel(entry)}
										</span>
									))
								) : (
									<span className="text-sm text-gray-500 dark:text-gray-400">No active QA runs</span>
								)}
							</div>
						</div>
					</div>
					{automatedQaState.lastError && (
						<p className="mt-3 text-sm text-red-600 dark:text-red-400">{automatedQaState.lastError}</p>
					)}
				</div>

				<div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-4">
					<h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">Recent QA Runs</h3>
					<p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
						Durable run records show when a QA review was queued, started, completed, failed, or abandoned.
					</p>
					<p className="mb-3 text-xs text-gray-500 dark:text-gray-400">
						Stale heartbeat threshold: {Math.round(automatedQaStaleThresholdMs / 1000)}s
					</p>
					<div className="space-y-3">
						{automatedQaRuns.length > 0 ? (
							automatedQaRuns.map((run) => {
								const isStale = isAutomatedQaRunStale(run);
								const automationName =
									run.automationName ?? getAutomationById(run.automationId)?.name ?? run.automationId ?? "Automated QA";
								return (
									<div
										key={run.id}
										className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-3"
									>
										<div className="flex flex-wrap items-center gap-2">
											<span className="font-medium text-gray-900 dark:text-gray-100">{run.taskId}</span>
											<span className="inline-flex items-center rounded-full bg-indigo-100 px-2.5 py-1 text-xs font-medium text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-200">
												{automationName}
											</span>
											<span
												className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
													run.status === "succeeded"
														? "bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200"
														: run.status === "failed" || run.status === "abandoned"
															? "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-200"
															: run.status === "started"
																? "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-200"
																: run.status === "queued"
																	? "bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200"
																	: "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-200"
												}`}
											>
												{run.status}
											</span>
											<span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-800 dark:bg-gray-700 dark:text-gray-200">
												phase {formatAutomatedQaPhase(run.phase)}
											</span>
											{isStale && (
												<span className="inline-flex items-center rounded-full bg-red-100 px-2.5 py-1 text-xs font-medium text-red-800 dark:bg-red-900/40 dark:text-red-200">
													stale heartbeat
												</span>
											)}
											<span className="text-xs text-gray-500 dark:text-gray-400">reviewer {run.reviewerAssignee}</span>
										</div>
										<div className="mt-2 grid gap-2 text-xs text-gray-500 dark:text-gray-400 md:grid-cols-2">
											<span>Automation ID: {run.automationId ?? "automated-qa"}</span>
											<span>Trigger: {run.triggerType ?? "status_transition"}</span>
											<span>Trigger signature: {run.triggerSignature ?? `to:${run.triggerStatus}`}</span>
											<span>Queue entry: {run.queueEntryId ?? "legacy"}</span>
											<span>Queued: {formatAutomatedQaTimestamp(run.queuedAt)}</span>
											<span>Started: {formatAutomatedQaTimestamp(run.startedAt)}</span>
											<span>Completed: {formatAutomatedQaTimestamp(run.completedAt)}</span>
											<span>Last heartbeat: {formatAutomatedQaTimestamp(run.lastHeartbeatAt)}</span>
											<span>Heartbeat note: {run.lastHeartbeatNote ?? "pending"}</span>
											<span>Last output: {formatAutomatedQaTimestamp(run.lastOutputAt)}</span>
											<span>Last output source: {run.lastOutputSource ?? "pending"}</span>
											<span>Final task status: {run.finalTaskStatus ?? "pending"}</span>
											<span>Codex PID: {run.codexPid ?? "not recorded"}</span>
											<span>Command: {run.codexCommand ?? "pending"}</span>
										</div>
										{isStale && (
											<p className="mt-2 text-sm text-amber-700 dark:text-amber-300">
												Heartbeat is older than the configured stale threshold. Verify the worker or reviewer process is still alive before trusting this run.
											</p>
										)}
										{run.error && <p className="mt-2 text-sm text-red-600 dark:text-red-400">{run.error}</p>}
										{(run.stdoutExcerpt || run.stderrExcerpt || run.lastOutputExcerpt) && (
											<div className="mt-3 space-y-2">
												{run.lastOutputExcerpt && (
													<div>
														<p className="text-xs font-medium uppercase tracking-wide text-gray-500 dark:text-gray-400">
															Last Output Excerpt
														</p>
														<pre className="mt-1 overflow-x-auto rounded bg-gray-950/90 px-3 py-2 text-xs text-gray-100 whitespace-pre-wrap">
															{formatAutomatedQaOutput(run.lastOutputExcerpt)}
														</pre>
													</div>
												)}
												{run.stdoutExcerpt && (
													<details className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-2">
														<summary className="cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300">
															Reviewer stdout excerpt
														</summary>
														<pre className="mt-2 overflow-x-auto rounded bg-gray-950/90 px-3 py-2 text-xs text-gray-100 whitespace-pre-wrap">
															{formatAutomatedQaOutput(run.stdoutExcerpt)}
														</pre>
													</details>
												)}
												{run.stderrExcerpt && (
													<details className="rounded border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/40 p-2">
														<summary className="cursor-pointer text-xs font-medium text-gray-700 dark:text-gray-300">
															Reviewer stderr excerpt
														</summary>
														<pre className="mt-2 overflow-x-auto rounded bg-gray-950/90 px-3 py-2 text-xs text-gray-100 whitespace-pre-wrap">
															{formatAutomatedQaOutput(run.stderrExcerpt)}
														</pre>
													</details>
												)}
											</div>
										)}
									</div>
								);
							})
						) : (
							<span className="text-sm text-gray-500 dark:text-gray-400">No recorded QA runs yet</span>
						)}
					</div>
				</div>

				<div className="rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900/30 p-4">
					<h3 className="text-sm font-medium text-gray-800 dark:text-gray-200 mb-2">Automation Audit Log</h3>
					<p className="text-sm text-gray-500 dark:text-gray-400 mb-3">
						Structured automation events from <code>backlog/audit-log/events.jsonl</code> with newest-first ordering.
					</p>
					{automationAuditError && <p className="mb-3 text-sm text-red-600 dark:text-red-400">{automationAuditError}</p>}
					<div className="space-y-3">
						{automationAuditEvents.length > 0 ? (
							automationAuditEvents.map((event) => (
								<div
									key={event.id}
									className="rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 px-3 py-3"
								>
									<div className="flex flex-wrap items-center gap-2">
										<span className="font-medium text-gray-900 dark:text-gray-100">{event.taskId}</span>
										<span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 dark:bg-gray-700 dark:text-gray-200">
											{formatAuditEventType(event.eventType)}
										</span>
										<span className="text-xs text-gray-500 dark:text-gray-400">
											{formatAutomatedQaTimestamp(event.occurredAt)}
										</span>
									</div>
									<p className="mt-2 text-sm text-gray-700 dark:text-gray-300">{event.summary}</p>
									<div className="mt-2 grid gap-2 text-xs text-gray-500 dark:text-gray-400 md:grid-cols-2">
										<span>Actor: {formatAuditActor(event)}</span>
										{Object.entries(event.data).slice(0, 7).map(([key, value]) => (
											<span key={`${event.id}-${key}`}>
												{key}: {formatAuditValue(value)}
											</span>
										))}
									</div>
								</div>
							))
						) : (
							<span className="text-sm text-gray-500 dark:text-gray-400">No automation audit events recorded yet</span>
						)}
					</div>
				</div>
			</div>
		</div>
	);
};

export default AgentOrchestrationSettingsSection;
