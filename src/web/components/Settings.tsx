import React, { useState, useEffect } from "react";
import { apiClient } from "../lib/api";
import { SuccessToast } from "./SuccessToast";
import AgentOrchestrationSettingsSection from "./AgentOrchestrationSettingsSection";
import type {
	AgentAutomationConfig,
	AgentAutomationQueueItem,
	AutomatedQaRunRecord,
	AutomatedQaState,
	BacklogConfig,
	TaskAuditEvent,
} from "../../types";
import {
	getDefaultStatusColor,
	normalizeHexColor,
	normalizeStatusColorMap,
} from "../utils/status-colors";

interface SettingsProps {
	mode?: "general" | "automation";
}

const Settings: React.FC<SettingsProps> = ({ mode = "general" }) => {
	const [config, setConfig] = useState<BacklogConfig | null>(null);
	const [originalConfig, setOriginalConfig] = useState<BacklogConfig | null>(null);
	const [loading, setLoading] = useState(true);
	const [saving, setSaving] = useState(false);
	const [error, setError] = useState<string | null>(null);
	const [showSuccess, setShowSuccess] = useState(false);
	const [newStatus, setNewStatus] = useState("");
	const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
	const [automatedQaState, setAutomatedQaState] = useState<AutomatedQaState>({
		queuedTaskIds: [],
		activeTaskIds: [],
	});
	const [automatedQaRuns, setAutomatedQaRuns] = useState<AutomatedQaRunRecord[]>([]);
	const [automatedQaStaleThresholdMs, setAutomatedQaStaleThresholdMs] = useState(60000);
	const [automationAuditEvents, setAutomationAuditEvents] = useState<TaskAuditEvent[]>([]);
	const [automationAuditError, setAutomationAuditError] = useState<string | null>(null);

	useEffect(() => {
		loadConfig();
	}, []);

	const loadAutomatedQa = async () => {
		try {
			const [data, auditPage] = await Promise.all([
				apiClient.fetchAutomatedQa(),
				apiClient.fetchAgentAutomationAuditLog({ limit: 20 }),
			]);
			setAutomatedQaState(data.state);
			setAutomatedQaRuns(data.recentRuns);
			setAutomatedQaStaleThresholdMs(data.staleThresholdMs);
			setAutomationAuditEvents(auditPage.events.filter((event) => event.eventType.startsWith("automation_")));
			setAutomationAuditError(null);
		} catch {
			setAutomatedQaState({ queuedTaskIds: [], activeTaskIds: [] });
			setAutomatedQaRuns([]);
			setAutomatedQaStaleThresholdMs(60000);
			setAutomationAuditEvents([]);
			setAutomationAuditError("Failed to load automation audit log");
		}
	};

	const normalizeAgentAutomationConfig = (
		automation: AgentAutomationConfig | undefined,
		index: number,
	): AgentAutomationConfig => {
		const triggerType = automation?.trigger?.type === "label_added" ? "label_added" : "status_transition";
		const triggerStatus = automation?.trigger?.toStatus?.trim() || (triggerType === "status_transition" ? "QA" : "");
		const labelsAny = Array.from(
			new Set((automation?.trigger?.labelsAny ?? []).map((value) => value.trim()).filter((value) => value.length > 0)),
		);
		const addedLabelsAny = Array.from(
			new Set(
				(automation?.trigger?.addedLabelsAny ?? []).map((value) => value.trim()).filter((value) => value.length > 0),
			),
		);
		const assigneesAny = Array.from(
			new Set(
				(automation?.trigger?.assigneesAny ?? []).map((value) => value.trim()).filter((value) => value.length > 0),
			),
		);
		return {
			id: automation?.id?.trim() || (index === 0 ? "automated-qa" : `automation-${index + 1}`),
			name: automation?.name?.trim() || (index === 0 ? "Automated QA" : `Automation ${index + 1}`),
			enabled: Boolean(automation?.enabled),
			paused: Boolean(automation?.paused),
			trigger: {
				type: triggerType,
				...(triggerStatus ? { toStatus: triggerStatus } : {}),
				...(automation?.trigger?.fromStatus?.trim() ? { fromStatus: automation.trigger.fromStatus.trim() } : {}),
				...(labelsAny.length > 0 ? { labelsAny } : {}),
				...(addedLabelsAny.length > 0 ? { addedLabelsAny } : {}),
				...(assigneesAny.length > 0 ? { assigneesAny } : {}),
			},
			codexCommand: automation?.codexCommand?.trim() || "codex",
			agentName: automation?.agentName?.trim() || "qa_engineer",
			reviewerAssignee: automation?.reviewerAssignee?.trim() || "QA",
			timeoutSeconds:
				typeof automation?.timeoutSeconds === "number" && Number.isFinite(automation.timeoutSeconds)
					? automation.timeoutSeconds
					: 180,
			maxConcurrentRuns:
				typeof automation?.maxConcurrentRuns === "number" && Number.isFinite(automation.maxConcurrentRuns)
					? Math.max(1, Math.floor(automation.maxConcurrentRuns))
					: 1,
			...(automation?.promptTemplate?.trim() ? { promptTemplate: automation.promptTemplate.trim() } : {}),
		};
	};

	const normalizeAgentAutomations = (value: BacklogConfig): AgentAutomationConfig[] => {
		const entries =
			Array.isArray(value.agentAutomations) && value.agentAutomations.length > 0
				? value.agentAutomations
				: [
						{
							id: "automated-qa",
							name: "Automated QA",
							enabled: value.automatedQa?.enabled,
							paused: value.automatedQa?.paused,
							trigger: {
								type: "status_transition" as const,
								toStatus: value.automatedQa?.triggerStatus?.trim() || "QA",
							},
							codexCommand: value.automatedQa?.codexCommand,
							agentName: value.automatedQa?.agentName,
							reviewerAssignee: value.automatedQa?.reviewerAssignee,
							timeoutSeconds: value.automatedQa?.timeoutSeconds,
							maxConcurrentRuns: 1,
						},
					];
		return entries.map((automation, index) => normalizeAgentAutomationConfig(automation, index));
	};

	const syncPrimaryAutomationFromAutomatedQa = (value: BacklogConfig): BacklogConfig => {
		const automations = normalizeAgentAutomations(value);
		const primary = normalizeAgentAutomationConfig(
			{
				...automations[0],
				id: automations[0]?.id || "automated-qa",
				name: automations[0]?.name || "Automated QA",
				enabled: value.automatedQa?.enabled,
				paused: value.automatedQa?.paused,
				trigger: {
					...(automations[0]?.trigger ?? { type: "status_transition" }),
					type: "status_transition",
					toStatus: value.automatedQa?.triggerStatus?.trim() || "QA",
				},
				codexCommand: value.automatedQa?.codexCommand,
				agentName: value.automatedQa?.agentName,
				reviewerAssignee: value.automatedQa?.reviewerAssignee,
				timeoutSeconds: value.automatedQa?.timeoutSeconds,
				maxConcurrentRuns: automations[0]?.maxConcurrentRuns ?? 1,
			},
			0,
		);
		return {
			...value,
			agentAutomations: [primary, ...automations.slice(1).map((automation, index) => normalizeAgentAutomationConfig(automation, index + 1))],
		};
	};

	const getAutomationById = (automationId: string | undefined): AgentAutomationConfig | undefined => {
		const automations = config?.agentAutomations ?? [];
		return automations.find((automation) => automation.id === automationId);
	};

	const formatQueueItemLabel = (entry: AgentAutomationQueueItem): string => {
		return `${entry.taskId} · ${entry.automationName ?? entry.automationId} · ${entry.triggerType}`;
	};

	const formatAutomatedQaTimestamp = (value: string | undefined): string => {
		if (!value) {
			return "n/a";
		}
		const parsed = new Date(value);
		if (Number.isNaN(parsed.getTime())) {
			return value;
		}
		return parsed.toLocaleString();
	};

	const isAutomatedQaRunStale = (run: AutomatedQaRunRecord): boolean => {
		if (run.status !== "started" || !run.lastHeartbeatAt) {
			return false;
		}
		const heartbeatMs = new Date(run.lastHeartbeatAt).getTime();
		if (Number.isNaN(heartbeatMs)) {
			return false;
		}
		return Date.now() - heartbeatMs > automatedQaStaleThresholdMs;
	};

	const formatAutomatedQaPhase = (phase: AutomatedQaRunRecord["phase"]): string => {
		if (!phase) {
			return "unknown";
		}
		return phase.replace(/_/g, " ");
	};

	const formatAutomatedQaOutput = (value: string | undefined): string => {
		const trimmed = value?.trim();
		return trimmed && trimmed.length > 0 ? trimmed : "none captured";
	};


	const normalizeStatuses = (items: string[] | undefined): string[] => {
		const unique = new Set<string>();
		for (const value of items ?? []) {
			const trimmed = value.trim();
			if (trimmed.length > 0) {
				unique.add(trimmed);
			}
		}
		return Array.from(unique);
	};

	const normalizeStatusColors = (statuses: string[], colors: Record<string, string> | undefined): Record<string, string> => {
		return normalizeStatusColorMap(statuses, colors);
	};

	const loadConfig = async () => {
		try {
			setLoading(true);
			const data = await apiClient.fetchConfig();
			const normalizedStatuses = normalizeStatuses(data.statuses);
			const defaultStatus = normalizedStatuses.includes(data.defaultStatus ?? "")
				? data.defaultStatus
				: normalizedStatuses[0];
			const agentAutomations = normalizeAgentAutomations(data);
			const primaryAutomation = agentAutomations[0];
			const normalizedData = {
				...data,
				statuses: normalizedStatuses.length > 0 ? normalizedStatuses : ["To Do", "In Progress", "Done"],
				defaultStatus: defaultStatus ?? "To Do",
				agentAutomations,
				automatedQa: {
					enabled: Boolean(primaryAutomation?.enabled),
					paused: Boolean(primaryAutomation?.paused),
					triggerStatus: primaryAutomation?.trigger?.toStatus?.trim() || "QA",
					codexCommand: primaryAutomation?.codexCommand?.trim() || "codex",
					agentName: primaryAutomation?.agentName?.trim() || "qa_engineer",
					reviewerAssignee: primaryAutomation?.reviewerAssignee?.trim() || "QA",
					timeoutSeconds:
						typeof primaryAutomation?.timeoutSeconds === "number" && Number.isFinite(primaryAutomation.timeoutSeconds)
							? primaryAutomation.timeoutSeconds
							: 180,
				},
				statusColors: normalizeStatusColors(
					normalizedStatuses.length > 0 ? normalizedStatuses : ["To Do", "In Progress", "Done"],
					data.statusColors,
				),
			};
			setConfig(normalizedData);
			setOriginalConfig(normalizedData);
			await loadAutomatedQa();
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to load configuration");
		} finally {
			setLoading(false);
		}
	};

	const handleInputChange = <K extends keyof BacklogConfig>(field: K, value: BacklogConfig[K]) => {
		setConfig((current) => {
			if (!current) return current;
			return {
				...current,
				[field]: value,
			};
		});

		// Clear validation error for this field
		setValidationErrors((current) => {
			if (!current[field]) return current;
			return {
				...current,
				[field]: "",
			};
		});
	};

	const handleStatusChange = (index: number, value: string) => {
		if (!config) return;
		const nextStatuses = [...config.statuses];
		const previousStatus = nextStatuses[index] ?? "";
		nextStatuses[index] = value;
		handleInputChange("statuses", nextStatuses);
		const nextStatusColors = { ...(config.statusColors ?? {}) };
		if (previousStatus !== value) {
			const previousColor = nextStatusColors[previousStatus];
			delete nextStatusColors[previousStatus];
			const normalizedNextColor = normalizeHexColor(previousColor ?? "");
			if (value.trim()) {
				nextStatusColors[value] = normalizedNextColor ?? getDefaultStatusColor(value);
			}
		}
		handleInputChange("statusColors", normalizeStatusColors(nextStatuses, nextStatusColors));
	};

	const handleStatusColorChange = (status: string, color: string) => {
		if (!config) return;
		const normalized = normalizeHexColor(color);
		if (!normalized) return;
		const next = {
			...(config.statusColors ?? {}),
			[status]: normalized,
		};
		handleInputChange("statusColors", next);
	};

	const handleAddStatus = () => {
		if (!config) return;
		const trimmedStatus = newStatus.trim();
		if (!trimmedStatus || config.statuses.includes(trimmedStatus)) {
			return;
		}
		handleInputChange("statuses", [...config.statuses, trimmedStatus]);
		handleInputChange("statusColors", {
			...(config.statusColors ?? {}),
			[trimmedStatus]: getDefaultStatusColor(trimmedStatus),
		});
		setNewStatus("");
	};

	const handleRemoveStatus = (index: number) => {
		if (!config) return;
		const removedStatus = config.statuses[index];
		const nextStatuses = config.statuses.filter((_, statusIndex) => statusIndex !== index);
		const normalizedStatuses = normalizeStatuses(nextStatuses);
		const fallbackStatuses = normalizedStatuses.length > 0 ? normalizedStatuses : ["To Do", "In Progress", "Done"];
		handleInputChange("statuses", fallbackStatuses);
		handleInputChange("statusColors", normalizeStatusColors(fallbackStatuses, config.statusColors));
		if (config.defaultStatus === removedStatus) {
			handleInputChange("defaultStatus", fallbackStatuses[0] ?? "To Do");
		}
	};

	const handleMoveStatus = (fromIndex: number, toIndex: number) => {
		if (!config) return;
		if (toIndex < 0 || toIndex >= config.statuses.length || fromIndex === toIndex) {
			return;
		}
		const nextStatuses = [...config.statuses];
		const [moved] = nextStatuses.splice(fromIndex, 1);
		if (!moved) {
			return;
		}
		nextStatuses.splice(toIndex, 0, moved);
		handleInputChange("statuses", nextStatuses);
	};

	const normalizeDefinitionOfDone = (items: string[] | undefined): string[] | undefined => {
		const normalized = (items ?? []).map((item) => item.trim()).filter((item) => item.length > 0);
		return normalized.length > 0 ? normalized : undefined;
	};

	const validateConfig = (): boolean => {
		const errors: Record<string, string> = {};

		if (!config) return false;

		// Validate project name
		if (!config.projectName.trim()) {
			errors.projectName = "Project name is required";
		}

		// Validate port number
		if (config.defaultPort && (config.defaultPort < 1 || config.defaultPort > 65535)) {
			errors.defaultPort = "Port must be between 1 and 65535";
		}

		const normalizedStatuses = normalizeStatuses(config.statuses);
		if (normalizedStatuses.length === 0) {
			errors.statuses = "At least one status is required";
		}

		if ((config.defaultStatus ?? "").trim().length === 0) {
			errors.defaultStatus = "Default status is required";
		} else if (normalizedStatuses.length > 0 && !normalizedStatuses.includes(config.defaultStatus ?? "")) {
			errors.defaultStatus = "Default status must be one of your configured statuses";
		}

		if (config.automatedQa?.enabled) {
			const triggerStatus = config.automatedQa.triggerStatus?.trim() ?? "";
			if (!triggerStatus) {
				errors.automatedQaTriggerStatus = "Automated QA trigger status is required when the feature is enabled";
			} else if (!normalizedStatuses.includes(triggerStatus)) {
				errors.automatedQaTriggerStatus = "Automated QA trigger status must match one of your configured statuses";
			}
			const timeoutSeconds = Number(config.automatedQa.timeoutSeconds);
			if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 30 || timeoutSeconds > 7200) {
				errors.automatedQaTimeoutSeconds = "Automated QA timeout must be between 30 and 7200 seconds";
			}
		}

		const normalizedAutomations = normalizeAgentAutomations(syncPrimaryAutomationFromAutomatedQa(config));
		normalizedAutomations.forEach((automation, index) => {
			if (!automation.enabled) {
				return;
			}
			const triggerStatus = automation.trigger?.toStatus?.trim() ?? "";
			if (automation.trigger?.type !== "label_added" && !triggerStatus) {
				errors[`agentAutomation-${index}-triggerStatus`] = `${automation.name} needs a trigger status`;
			}
			if (triggerStatus && !normalizedStatuses.includes(triggerStatus)) {
				errors[`agentAutomation-${index}-triggerStatus`] =
					`${automation.name} trigger status must match one of your configured statuses`;
			}
			const timeoutSeconds = Number(automation.timeoutSeconds);
			if (!Number.isFinite(timeoutSeconds) || timeoutSeconds < 30 || timeoutSeconds > 7200) {
				errors[`agentAutomation-${index}-timeoutSeconds`] = `${automation.name} timeout must be between 30 and 7200 seconds`;
			}
			const maxConcurrentRuns = Number(automation.maxConcurrentRuns);
			if (!Number.isFinite(maxConcurrentRuns) || maxConcurrentRuns < 1 || maxConcurrentRuns > 25) {
				errors[`agentAutomation-${index}-maxConcurrentRuns`] =
					`${automation.name} max concurrency must be between 1 and 25`;
			}
			if (automation.trigger?.type === "label_added" && (automation.trigger.addedLabelsAny ?? []).length === 0) {
				errors[`agentAutomation-${index}-addedLabelsAny`] =
					`${automation.name} needs at least one added label trigger`;
			}
		});

		setValidationErrors(errors);
		return Object.keys(errors).length === 0;
	};

	const handleSave = async () => {
		if (!config || !validateConfig()) return;

		try {
			setSaving(true);
			const normalizedStatuses = normalizeStatuses(config.statuses);
			const fallbackStatuses = normalizedStatuses.length > 0 ? normalizedStatuses : ["To Do", "In Progress", "Done"];
			const normalizedDefaultStatus = fallbackStatuses.includes(config.defaultStatus ?? "")
				? config.defaultStatus
				: fallbackStatuses[0];
			const syncedConfig = syncPrimaryAutomationFromAutomatedQa({
				...config,
				statuses: fallbackStatuses,
				defaultStatus: normalizedDefaultStatus,
				statusColors: normalizeStatusColors(fallbackStatuses, config.statusColors),
				definitionOfDone: normalizeDefinitionOfDone(config.definitionOfDone),
			});
			const normalizedConfig = {
				...syncedConfig,
				...config,
				statuses: fallbackStatuses,
				defaultStatus: normalizedDefaultStatus,
				statusColors: normalizeStatusColors(fallbackStatuses, config.statusColors),
				definitionOfDone: normalizeDefinitionOfDone(config.definitionOfDone),
				agentAutomations: normalizeAgentAutomations(syncedConfig),
				automatedQa: {
					enabled: Boolean(config.automatedQa?.enabled),
					paused: Boolean(config.automatedQa?.paused),
					triggerStatus: config.automatedQa?.triggerStatus?.trim() || "QA",
					codexCommand: config.automatedQa?.codexCommand?.trim() || "codex",
					agentName: config.automatedQa?.agentName?.trim() || "qa_engineer",
					reviewerAssignee: config.automatedQa?.reviewerAssignee?.trim() || "QA",
					timeoutSeconds: Number(config.automatedQa?.timeoutSeconds) || 180,
				},
			};
			await apiClient.updateConfig(normalizedConfig);
			setConfig(normalizedConfig);
			setOriginalConfig(normalizedConfig);
			await loadAutomatedQa();
			setShowSuccess(true);
			setTimeout(() => setShowSuccess(false), 3000);
			setError(null);
		} catch (err) {
			setError(err instanceof Error ? err.message : "Failed to save configuration");
		} finally {
			setSaving(false);
		}
	};

	const handleCancel = () => {
		setConfig(originalConfig);
		setValidationErrors({});
	};

	const hasUnsavedChanges = JSON.stringify(config) !== JSON.stringify(originalConfig);
	const isAutomationMode = mode === "automation";
	const pageTitle = isAutomationMode ? "AI Agent Orchestration" : "Settings";
	const loadingLabel = isAutomationMode ? "Loading AI agent orchestration..." : "Loading settings...";
	const loadFailureLabel = isAutomationMode ? "Failed to load AI agent orchestration" : "Failed to load configuration";

	if (loading) {
		return (
			<div className="container mx-auto px-4 py-8">
				<div className="flex items-center justify-center py-12">
					<div className="text-lg text-gray-600 dark:text-gray-300">{loadingLabel}</div>
				</div>
			</div>
		);
	}

	if (!config) {
		return (
			<div className="container mx-auto px-4 py-8">
				<div className="flex items-center justify-center py-12">
					<div className="text-red-600 dark:text-red-400">{loadFailureLabel}</div>
				</div>
			</div>
		);
	}

	return (
		<div className="container mx-auto px-4 py-8 transition-colors duration-200">
			<div className="max-w-4xl mx-auto">
				<h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-8">{pageTitle}</h1>

				{error && (
					<div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-700 rounded-lg">
						<p className="text-sm text-red-700 dark:text-red-400">{error}</p>
					</div>
				)}

				<div className="space-y-8">
					{isAutomationMode ? (
						<AgentOrchestrationSettingsSection
							config={config}
							validationErrors={validationErrors}
							automatedQaState={automatedQaState}
							automatedQaRuns={automatedQaRuns}
							automatedQaStaleThresholdMs={automatedQaStaleThresholdMs}
							automationAuditEvents={automationAuditEvents}
							automationAuditError={automationAuditError}
							handleInputChange={handleInputChange}
							getAutomationById={getAutomationById}
							formatQueueItemLabel={formatQueueItemLabel}
							formatAutomatedQaTimestamp={formatAutomatedQaTimestamp}
							isAutomatedQaRunStale={isAutomatedQaRunStale}
							formatAutomatedQaPhase={formatAutomatedQaPhase}
							formatAutomatedQaOutput={formatAutomatedQaOutput}
						/>
					) : (
						<>
					{/* Project Settings */}
					<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
						<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Project Settings</h2>
						<div className="space-y-4">
							<div>
								<label htmlFor="projectName" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									Project Name
								</label>
								<input
									id="projectName"
									type="text"
									value={config.projectName}
									onChange={(e) => handleInputChange('projectName', e.target.value)}
									className={`w-full px-3 py-2 border rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200 ${
										validationErrors.projectName 
											? 'border-red-500 dark:border-red-400' 
											: 'border-gray-300 dark:border-gray-600'
									}`}
								/>
								{validationErrors.projectName && (
									<p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.projectName}</p>
								)}
							</div>

							<div>
								<label htmlFor="dateFormat" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									Date Format
								</label>
								<select
									id="dateFormat"
									value={config.dateFormat}
									onChange={(e) => handleInputChange('dateFormat', e.target.value)}
									className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200"
								>
									<option value="yyyy-mm-dd">yyyy-mm-dd</option>
									<option value="dd/mm/yyyy">dd/mm/yyyy</option>
									<option value="mm/dd/yyyy">mm/dd/yyyy</option>
								</select>
							</div>
						</div>
					</div>

					{/* Workflow Settings */}
					<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
						<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Workflow Settings</h2>
						<div className="space-y-4">
							<div>
								<label className="flex items-center justify-between">
									<div>
										<span className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto Commit</span>
										<p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
											Automatically commit changes to Git after task operations
										</p>
									</div>
									<div className="relative inline-flex items-center cursor-pointer">
										<input
											type="checkbox"
											checked={config.autoCommit}
											onChange={(e) => handleInputChange('autoCommit', e.target.checked)}
											className="sr-only peer"
										/>
										<div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-circle peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-circle after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
									</div>
								</label>
							</div>

							<div>
								<label className="flex items-center justify-between">
									<div>
										<span className="text-sm font-medium text-gray-700 dark:text-gray-300">Remote Operations</span>
										<p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
											Fetch tasks information from remote branches
										</p>
									</div>
									<div className="relative inline-flex items-center cursor-pointer">
										<input
											type="checkbox"
											checked={config.remoteOperations}
											onChange={(e) => handleInputChange('remoteOperations', e.target.checked)}
											className="sr-only peer"
										/>
										<div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-circle peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-circle after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
									</div>
								</label>
							</div>

							<div>
								<label htmlFor="defaultStatus" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									Default Status
								</label>
								<select
									id="defaultStatus"
									value={config.defaultStatus || ""}
									onChange={(e) => handleInputChange('defaultStatus', e.target.value)}
									className={`w-full h-10 px-3 py-2 border rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200 ${
										validationErrors.defaultStatus
											? "border-red-500 dark:border-red-400"
											: "border-gray-300 dark:border-gray-600"
									}`}
								>
									{config.statuses.map((status) => (
										<option key={status} value={status}>{status}</option>
									))}
								</select>
								{validationErrors.defaultStatus && (
									<p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.defaultStatus}</p>
								)}
								<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
									Default status for new tasks
								</p>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
									Custom Statuses
								</label>
								<div className="space-y-2">
									{config.statuses.map((status, index) => (
										<div key={`status-${index}`} className="flex items-center gap-2">
											<input
												type="color"
												value={config.statusColors?.[status] ?? getDefaultStatusColor(status)}
												onChange={(e) => handleStatusColorChange(status, e.target.value)}
												className="h-10 w-12 p-1 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700"
												aria-label={`Color for status ${status || index + 1}`}
											/>
											<input
												type="text"
												value={status}
												onChange={(e) => handleStatusChange(index, e.target.value)}
												className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200"
												placeholder="Status name"
											/>
											<button
												type="button"
												onClick={() => handleMoveStatus(index, index - 1)}
												disabled={index === 0}
												className="px-2 py-2 text-sm text-gray-600 dark:text-gray-300 hover:underline disabled:opacity-40"
												aria-label={`Move ${status} up`}
												title="Move up"
											>
												↑
											</button>
											<button
												type="button"
												onClick={() => handleMoveStatus(index, index + 1)}
												disabled={index === config.statuses.length - 1}
												className="px-2 py-2 text-sm text-gray-600 dark:text-gray-300 hover:underline disabled:opacity-40"
												aria-label={`Move ${status} down`}
												title="Move down"
											>
												↓
											</button>
											<button
												type="button"
												onClick={() => handleRemoveStatus(index)}
												className="px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:underline"
											>
												Remove
											</button>
										</div>
									))}
									<div className="flex items-center gap-2 pt-1">
										<input
											type="text"
											value={newStatus}
											onChange={(e) => setNewStatus(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter") {
													e.preventDefault();
													handleAddStatus();
												}
											}}
											className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200"
											placeholder="Add a status"
										/>
										<button
											type="button"
											onClick={handleAddStatus}
											className="px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
										>
											Add
										</button>
									</div>
								</div>
								{validationErrors.statuses && (
									<p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.statuses}</p>
								)}
								<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
									Statuses define your board columns and task workflow. Use the arrows to control kanban column order.
								</p>
							</div>

							<div>
								<label htmlFor="defaultEditor" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									Default Editor
								</label>
								<input
									id="defaultEditor"
									type="text"
									value={config.defaultEditor}
									onChange={(e) => handleInputChange('defaultEditor', e.target.value)}
									className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200"
									placeholder="e.g., vim, nano, code"
								/>
								<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
									Editor command to use for editing tasks (overrides EDITOR environment variable)
								</p>
							</div>
						</div>
					</div>

					{/* Definition of Done Defaults */}
					<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
						<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">Definition of Done Defaults</h2>
						<p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
							These checklist items are added to new tasks by default.
						</p>
						<div className="space-y-3">
							{(config.definitionOfDone ?? []).map((item, index) => (
								<div key={`definition-of-done-${index}`} className="flex items-center gap-2">
									<input
										type="text"
										value={item}
										onChange={(e) => {
											const next = [...(config.definitionOfDone ?? [])];
											next[index] = e.target.value;
											handleInputChange('definitionOfDone', next);
										}}
										className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200"
										placeholder="Checklist item"
									/>
									<button
										type="button"
										onClick={() => {
											const next = (config.definitionOfDone ?? []).filter((_, idx) => idx !== index);
											handleInputChange('definitionOfDone', next);
										}}
										className="px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:underline"
									>
										Remove
									</button>
								</div>
							))}
							<button
								type="button"
								onClick={() => handleInputChange('definitionOfDone', [...(config.definitionOfDone ?? []), ""])}
								className="inline-flex items-center px-3 py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:underline"
							>
								+ Add item
							</button>
						</div>
					</div>

					{/* Web UI Settings */}
					<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
						<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Web UI Settings</h2>
						<div className="space-y-4">
							<div>
								<label htmlFor="defaultPort" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									Default Port
								</label>
								<input
									id="defaultPort"
									type="number"
									min="1"
									max="65535"
									value={config.defaultPort || 6420}
									onChange={(e) => handleInputChange('defaultPort', parseInt(e.target.value) || 6420)}
									className={`w-full px-3 py-2 border rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200 ${
										validationErrors.defaultPort 
											? 'border-red-500 dark:border-red-400' 
											: 'border-gray-300 dark:border-gray-600'
									}`}
								/>
								{validationErrors.defaultPort && (
									<p className="mt-1 text-sm text-red-600 dark:text-red-400">{validationErrors.defaultPort}</p>
								)}
							</div>

							<div>
								<label className="flex items-center justify-between">
									<div>
										<span className="text-sm font-medium text-gray-700 dark:text-gray-300">Auto Open Browser</span>
										<p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
											Automatically open browser when starting web UI
										</p>
									</div>
									<div className="relative inline-flex items-center cursor-pointer">
										<input
											type="checkbox"
											checked={config.autoOpenBrowser}
											onChange={(e) => handleInputChange('autoOpenBrowser', e.target.checked)}
											className="sr-only peer"
										/>
										<div className="w-11 h-6 bg-gray-200 dark:bg-gray-700 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 dark:peer-focus:ring-blue-800 rounded-circle peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-circle after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-500"></div>
									</div>
								</label>
							</div>
						</div>
					</div>

					{/* Advanced Settings */}
					<div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
						<h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-4">Advanced Settings</h2>
						<div className="space-y-4">
							<div>
								<label htmlFor="maxColumnWidth" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									Max Column Width
								</label>
								<input
									id="maxColumnWidth"
									type="number"
									min="20"
									max="200"
									value={config.maxColumnWidth}
									onChange={(e) => handleInputChange('maxColumnWidth', parseInt(e.target.value) || 80)}
									className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200"
								/>
								<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
									Maximum width for text columns in CLI output
								</p>
							</div>

							<div>
								<label htmlFor="taskResolutionStrategy" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									Task Resolution Strategy
								</label>
								<select
									id="taskResolutionStrategy"
									value={config.taskResolutionStrategy}
									onChange={(e) => handleInputChange('taskResolutionStrategy', e.target.value as 'most_recent' | 'most_progressed')}
									className="w-full h-10 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200"
								>
									<option value="most_recent">Most Recent</option>
									<option value="most_progressed">Most Progressed</option>
								</select>
								<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
									Strategy for resolving conflicts when tasks exist in multiple branches
								</p>
							</div>

							<div>
								<label htmlFor="zeroPaddedIds" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									Zero-Padded IDs
								</label>
								<input
									id="zeroPaddedIds"
									type="number"
									min="0"
									max="10"
									value={config.zeroPaddedIds || 0}
									onChange={(e) => handleInputChange('zeroPaddedIds', parseInt(e.target.value) || 0)}
									className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 transition-colors duration-200"
								/>
								<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
									Number of digits for ID padding (0 = disabled, 3 = task-001, 4 = task-0001)
								</p>
							</div>

							<div>
								<label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
									Task Prefix <span className="text-gray-400 dark:text-gray-500 font-normal">(read-only)</span>
								</label>
								<input
									type="text"
									value={(config.prefixes?.task || 'task').toUpperCase()}
									disabled
									className="w-full px-3 py-2 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 cursor-not-allowed"
								/>
								<p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
									Set during initialization. Cannot be changed to avoid breaking existing task IDs.
								</p>
							</div>
						</div>
					</div>
						</>
					)}

					{/* Save/Cancel Buttons */}
						<div className="flex items-center justify-end space-x-4">
							<button
								onClick={handleCancel}
								disabled={!hasUnsavedChanges || saving}
								className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 focus:outline-none focus:ring-2 focus:ring-stone-500 dark:focus:ring-stone-400 disabled:opacity-50 transition-colors duration-200"
							>
								Cancel
							</button>
							<button
								onClick={handleSave}
								disabled={!hasUnsavedChanges || saving}
								className="px-4 py-2 bg-blue-500 dark:bg-blue-600 text-white rounded-lg hover:bg-blue-600 dark:hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-400 dark:focus:ring-blue-500 disabled:opacity-50 transition-colors duration-200"
							>
								{saving ? 'Saving...' : 'Save Changes'}
							</button>
						</div>
				</div>
			</div>

			{/* Success Toast */}
			{showSuccess && (
				<SuccessToast
					message="Settings saved successfully!"
					onDismiss={() => setShowSuccess(false)}
				/>
			)}
		</div>
	);
};

export default Settings;
