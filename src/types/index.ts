export type TaskStatus = string;

/**
 * Entity types in the backlog system.
 * Used for ID generation and prefix resolution.
 */
export enum EntityType {
	Task = "task",
	Draft = "draft",
	Document = "document",
	Decision = "decision",
}

// Structured Acceptance Criterion (domain-level)
export interface AcceptanceCriterion {
	index: number; // 1-based
	text: string;
	checked: boolean;
}

export interface AcceptanceCriterionInput {
	text: string;
	checked?: boolean;
}

export interface Task {
	id: string;
	title: string;
	status: TaskStatus;
	assignee: string[];
	reporter?: string;
	createdDate: string;
	updatedDate?: string;
	labels: string[];
	milestone?: string;
	dependencies: string[];
	references?: string[];
	documentation?: string[];
	readonly rawContent?: string; // Raw markdown content without frontmatter (read-only: do not modify directly)
	description?: string;
	implementationPlan?: string;
	implementationNotes?: string;
	finalSummary?: string;
	/** Structured acceptance criteria parsed from body (checked state + text + index) */
	acceptanceCriteriaItems?: AcceptanceCriterion[];
	/** Structured Definition of Done checklist parsed from body (checked state + text + index) */
	definitionOfDoneItems?: AcceptanceCriterion[];
	parentTaskId?: string;
	parentTaskTitle?: string;
	subtasks?: string[];
	subtaskSummaries?: Array<{ id: string; title: string }>;
	summaryParentTaskId?: string;
	summaryParentTaskTitle?: string;
	summaryChildren?: string[];
	summaryChildSummaries?: Array<{ id: string; title: string }>;
	priority?: "high" | "medium" | "low";
	branch?: string;
	ordinal?: number;
	filePath?: string;
	// Metadata fields
	lastModified?: Date;
	source?: "local" | "remote" | "completed" | "local-branch";
	/** Optional per-task callback command to run on status change (overrides global config) */
	onStatusChange?: string;
}

export interface MilestoneBucket {
	key: string;
	label: string;
	milestone?: string;
	isNoMilestone: boolean;
	isCompleted: boolean;
	tasks: Task[];
	statusCounts: Record<string, number>;
	total: number;
	doneCount: number;
	progress: number;
}

export interface MilestoneSummary {
	milestones: string[];
	buckets: MilestoneBucket[];
}

/**
 * Check if a task is locally editable (not from a remote or other local branch)
 */
export function isLocalEditableTask(task: Task): boolean {
	return task.source === undefined || task.source === "local" || task.source === "completed";
}

export interface TaskCreateInput {
	title: string;
	description?: string;
	status?: TaskStatus;
	priority?: "high" | "medium" | "low";
	milestone?: string;
	labels?: string[];
	assignee?: string[];
	dependencies?: string[];
	references?: string[];
	documentation?: string[];
	parentTaskId?: string;
	summaryParentTaskId?: string;
	implementationPlan?: string;
	implementationNotes?: string;
	finalSummary?: string;
	acceptanceCriteria?: AcceptanceCriterionInput[];
	definitionOfDoneAdd?: string[];
	disableDefinitionOfDoneDefaults?: boolean;
	rawContent?: string;
}

export interface TaskUpdateInput {
	title?: string;
	description?: string;
	status?: TaskStatus;
	priority?: "high" | "medium" | "low";
	milestone?: string | null;
	labels?: string[];
	addLabels?: string[];
	removeLabels?: string[];
	assignee?: string[];
	ordinal?: number;
	dependencies?: string[];
	addDependencies?: string[];
	removeDependencies?: string[];
	references?: string[];
	addReferences?: string[];
	removeReferences?: string[];
	documentation?: string[];
	addDocumentation?: string[];
	removeDocumentation?: string[];
	summaryParentTaskId?: string | null;
	implementationPlan?: string;
	appendImplementationPlan?: string[];
	clearImplementationPlan?: boolean;
	implementationNotes?: string;
	appendImplementationNotes?: string[];
	clearImplementationNotes?: boolean;
	finalSummary?: string;
	appendFinalSummary?: string[];
	clearFinalSummary?: boolean;
	acceptanceCriteria?: AcceptanceCriterionInput[];
	addAcceptanceCriteria?: Array<AcceptanceCriterionInput | string>;
	removeAcceptanceCriteria?: number[];
	checkAcceptanceCriteria?: number[];
	uncheckAcceptanceCriteria?: number[];
	addDefinitionOfDone?: Array<AcceptanceCriterionInput | string>;
	removeDefinitionOfDone?: number[];
	checkDefinitionOfDone?: number[];
	uncheckDefinitionOfDone?: number[];
	rawContent?: string;
}

export type TaskAuditEventType =
	| "task_status_changed"
	| "task_assignee_changed"
	| "task_labels_changed"
	| "task_priority_changed"
	| "task_milestone_changed"
	| "automation_run_queued"
	| "automation_run_dequeued"
	| "automation_task_claimed"
	| "automation_reviewer_launching"
	| "automation_reviewer_started"
	| "automation_reviewer_output"
	| "automation_run_succeeded"
	| "automation_run_failed"
	| "automation_run_skipped"
	| "automation_run_abandoned"
	| "automation_queue_paused";

export interface TaskAuditActor {
	kind: "user" | "automation" | "system";
	id?: string;
	displayName?: string;
	source?: "cli" | "web" | "automation-worker" | "status-callback";
	automationId?: string;
	automationName?: string;
	queueEntryId?: string;
	runId?: string;
	agentName?: string;
	processId?: number;
}

export interface TaskAuditEvent {
	id: string;
	taskId: string;
	eventType: TaskAuditEventType;
	occurredAt: string;
	actor: TaskAuditActor;
	summary: string;
	data: Record<string, unknown>;
}

export interface TaskAuditEventFilter {
	taskId?: string;
	eventType?: TaskAuditEventType;
	automationId?: string;
	limit?: number;
	cursor?: string;
}

export interface TaskAuditEventPage {
	events: TaskAuditEvent[];
	nextCursor?: string;
}

export interface TaskListFilter {
	status?: string;
	assignee?: string;
	priority?: "high" | "medium" | "low";
	parentTaskId?: string;
	summaryParentTaskId?: string;
	labels?: string[];
	/** Canonical milestone id (after resolving user input against milestone files). */
	milestoneId?: string;
	/** When true, only tasks with no milestone set. */
	withoutMilestone?: boolean;
}

export type GovernanceReportId =
	| "missing-documentation"
	| "invalid-labels"
	| "invalid-dependencies"
	| "invalid-milestones"
	| "missing-summary-parent";

export interface GovernanceReportFinding {
	taskId: string;
	taskTitle: string;
	summary: string;
	details: string[];
	task: Task;
}

export interface GovernanceReport {
	id: GovernanceReportId;
	title: string;
	description: string;
	taskCount: number;
	generatedAt: string;
	findings: GovernanceReportFinding[];
}

export interface Decision {
	id: string;
	title: string;
	date: string;
	status: "proposed" | "accepted" | "rejected" | "superseded";
	context: string;
	decision: string;
	consequences: string;
	alternatives?: string;
	readonly rawContent: string; // Raw markdown content without frontmatter
}

export interface Milestone {
	id: string;
	title: string;
	description: string;
	readonly rawContent: string; // Raw markdown content without frontmatter
}

export interface Document {
	id: string;
	title: string;
	type: "readme" | "guide" | "specification" | "other";
	createdDate: string;
	updatedDate?: string;
	rawContent: string; // Raw markdown content without frontmatter
	tags?: string[];
	// Web UI specific fields
	name?: string;
	path?: string;
	lastModified?: string;
	isLegacy?: boolean;
}

export type SearchResultType = "task" | "document" | "decision";

export type SearchPriorityFilter = "high" | "medium" | "low";

export interface SearchMatch {
	key?: string;
	indices: Array<[number, number]>;
	value?: unknown;
}

export interface SearchFilters {
	status?: string | string[];
	priority?: SearchPriorityFilter | SearchPriorityFilter[];
	assignee?: string | string[];
	labels?: string | string[];
	milestone?: string | string[];
	withoutMilestone?: boolean;
}

export interface SearchOptions {
	query?: string;
	limit?: number;
	types?: SearchResultType[];
	filters?: SearchFilters;
}

export interface TaskSearchResult {
	type: "task";
	score: number | null;
	task: Task;
	matches?: SearchMatch[];
}

export interface DocumentSearchResult {
	type: "document";
	score: number | null;
	document: Document;
	matches?: SearchMatch[];
}

export interface DecisionSearchResult {
	type: "decision";
	score: number | null;
	decision: Decision;
	matches?: SearchMatch[];
}

export type SearchResult = TaskSearchResult | DocumentSearchResult | DecisionSearchResult;

export interface Sequence {
	/** 1-based sequence index */
	index: number;
	/** Tasks that can be executed in parallel within this sequence */
	tasks: Task[];
}

/**
 * Configuration for ID prefixes used in task files.
 * Allows customization of task prefix (e.g., "JIRA-", "issue-", "bug-").
 * Note: Draft prefix is always "draft" and not configurable.
 */
export interface PrefixConfig {
	/** Prefix for task IDs (default: "task") - produces IDs like TASK-1, TASK-2 */
	task: string;
}

export interface AutomatedQaConfig {
	enabled?: boolean;
	paused?: boolean;
	triggerStatus?: string;
	codexCommand?: string;
	agentName?: string;
	reviewerAssignee?: string;
	timeoutSeconds?: number;
}

export type AgentAutomationTriggerType = "status_transition" | "label_added";

export interface AgentAutomationTriggerConfig {
	type?: AgentAutomationTriggerType;
	toStatus?: string;
	fromStatus?: string;
	labelsAny?: string[];
	addedLabelsAny?: string[];
	assigneesAny?: string[];
}

export interface AgentAutomationConfig {
	id?: string;
	name?: string;
	enabled?: boolean;
	paused?: boolean;
	trigger?: AgentAutomationTriggerConfig;
	codexCommand?: string;
	agentName?: string;
	reviewerAssignee?: string;
	timeoutSeconds?: number;
	maxConcurrentRuns?: number;
	promptTemplate?: string;
}

export interface AgentAutomationQueueItem {
	id: string;
	taskId: string;
	automationId: string;
	automationName?: string;
	triggerType: AgentAutomationTriggerType;
	triggerStatus?: string;
	triggerSignature: string;
	queuedAt: string;
}

export interface AutomatedQaState {
	queuedTaskIds: string[];
	activeTaskIds: string[];
	queuedRuns?: AgentAutomationQueueItem[];
	activeRuns?: AgentAutomationQueueItem[];
	lastRunAt?: string;
	lastCompletedTaskId?: string;
	lastError?: string;
}

export type AutomatedQaRunStatus = "queued" | "started" | "succeeded" | "failed" | "abandoned" | "skipped";

export type AutomatedQaRunPhase =
	| "queued"
	| "worker_claimed"
	| "reviewer_launching"
	| "reviewer_running"
	| "reviewer_completed"
	| "reviewer_failed"
	| "abandoned"
	| "skipped";

export interface AutomatedQaRunRecord {
	id: string;
	taskId: string;
	queueEntryId?: string;
	automationId?: string;
	automationName?: string;
	triggerType?: AgentAutomationTriggerType;
	triggerSignature?: string;
	status: AutomatedQaRunStatus;
	phase?: AutomatedQaRunPhase;
	triggerStatus: string;
	agentName: string;
	reviewerAssignee: string;
	queuedAt: string;
	startedAt?: string;
	completedAt?: string;
	lastHeartbeatAt?: string;
	lastHeartbeatNote?: string;
	workerPid?: number;
	codexPid?: number;
	codexCommand?: string;
	stdoutExcerpt?: string;
	stderrExcerpt?: string;
	lastOutputAt?: string;
	lastOutputSource?: "stdout" | "stderr";
	lastOutputExcerpt?: string;
	error?: string;
	exitCode?: number;
	finalTaskStatus?: string;
}

export type ValidationTaskField =
	| "description"
	| "documentation"
	| "assignee"
	| "labels"
	| "milestone"
	| "priority"
	| "implementationPlan"
	| "implementationNotes"
	| "finalSummary"
	| "acceptanceCriteria"
	| "definitionOfDone";

export interface ValidationConfig {
	requiredTaskFields?: ValidationTaskField[];
}

export interface BacklogConfig {
	projectName: string;
	defaultAssignee?: string;
	defaultReporter?: string;
	statuses: string[];
	statusColors?: Record<string, string>;
	labels: string[];
	/** @deprecated Milestones are sourced from milestone files, not config. */
	milestones?: string[];
	definitionOfDone?: string[];
	defaultStatus?: string;
	dateFormat: string;
	maxColumnWidth?: number;
	taskResolutionStrategy?: "most_recent" | "most_progressed";
	defaultEditor?: string;
	autoOpenBrowser?: boolean;
	defaultPort?: number;
	remoteOperations?: boolean;
	autoCommit?: boolean;
	zeroPaddedIds?: number;
	includeDateTimeInDates?: boolean; // Whether to include time in new dates
	bypassGitHooks?: boolean;
	checkActiveBranches?: boolean; // Check task states across active branches (default: true)
	activeBranchDays?: number; // How many days a branch is considered active (default: 30)
	/** Global callback command to run on any task status change. Supports $TASK_ID, $OLD_STATUS, $NEW_STATUS, $TASK_TITLE variables. */
	onStatusChange?: string;
	agentAutomations?: AgentAutomationConfig[];
	automatedQa?: AutomatedQaConfig;
	validation?: ValidationConfig;
	/** ID prefix configuration for tasks and drafts. Defaults to { task: "task", draft: "draft" } */
	prefixes?: PrefixConfig;
	mcp?: {
		http?: {
			host?: string;
			port?: number;
			auth?: {
				type?: "bearer" | "basic" | "none";
				token?: string;
				username?: string;
				password?: string;
			};
			cors?: {
				origin?: string | string[];
				credentials?: boolean;
			};
			enableDnsRebindingProtection?: boolean;
			allowedHosts?: string[];
			allowedOrigins?: string[];
		};
	};
}

export interface ParsedMarkdown {
	frontmatter: Record<string, unknown>;
	content: string;
}
