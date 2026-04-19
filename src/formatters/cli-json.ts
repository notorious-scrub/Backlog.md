import type { AcceptanceCriterion, Decision, Document, SearchResult, Task } from "../types/index.ts";

export type CliChecklistItem = {
	index: number;
	text: string;
	checked: boolean;
};

export type CliTaskRecord = {
	id: string;
	title: string;
	status: string;
	assignee: string[];
	reporter: string | null;
	createdDate: string;
	updatedDate: string | null;
	labels: string[];
	milestone: string | null;
	dependencies: string[];
	references: string[];
	documentation: string[];
	description: string | null;
	implementationPlan: string | null;
	implementationNotes: string | null;
	finalSummary: string | null;
	acceptanceCriteria: CliChecklistItem[];
	definitionOfDone: CliChecklistItem[];
	parentTaskId: string | null;
	parentTaskTitle: string | null;
	summaryParentTaskId: string | null;
	summaryParentTaskTitle: string | null;
	subtasks: string[];
	subtaskSummaries: Array<{ id: string; title: string }>;
	summaryChildren: string[];
	summaryChildSummaries: Array<{ id: string; title: string }>;
	priority: "high" | "medium" | "low" | null;
	branch: string | null;
	ordinal: number | null;
	path: string | null;
	source: Task["source"] | null;
};

export type CliDocumentRecord = {
	id: string;
	title: string;
	type: Document["type"];
	createdDate: string;
	updatedDate: string | null;
	tags: string[];
	name: string | null;
	path: string | null;
	lastModified: string | null;
	isLegacy: boolean;
};

export type CliDecisionRecord = {
	id: string;
	title: string;
	date: string;
	status: Decision["status"];
	context: string;
	decision: string;
	consequences: string;
	alternatives: string | null;
};

type CliSearchTaskResult = {
	type: "task";
	score: number | null;
	task: CliTaskRecord;
};

type CliSearchDocumentResult = {
	type: "document";
	score: number | null;
	document: CliDocumentRecord;
};

type CliSearchDecisionResult = {
	type: "decision";
	score: number | null;
	decision: CliDecisionRecord;
};

export type CliSearchResult = CliSearchTaskResult | CliSearchDocumentResult | CliSearchDecisionResult;

function serializeChecklist(items?: AcceptanceCriterion[]): CliChecklistItem[] {
	return (items ?? []).map((item) => ({
		index: item.index,
		text: item.text,
		checked: item.checked,
	}));
}

export function serializeTaskForCli(task: Task, options: { filePathOverride?: string | null } = {}): CliTaskRecord {
	const path = options.filePathOverride ?? task.filePath ?? null;
	return {
		id: task.id,
		title: task.title,
		status: task.status,
		assignee: [...(task.assignee ?? [])],
		reporter: task.reporter ?? null,
		createdDate: task.createdDate,
		updatedDate: task.updatedDate ?? null,
		labels: [...(task.labels ?? [])],
		milestone: task.milestone ?? null,
		dependencies: [...(task.dependencies ?? [])],
		references: [...(task.references ?? [])],
		documentation: [...(task.documentation ?? [])],
		description: task.description ?? null,
		implementationPlan: task.implementationPlan ?? null,
		implementationNotes: task.implementationNotes ?? null,
		finalSummary: task.finalSummary ?? null,
		acceptanceCriteria: serializeChecklist(task.acceptanceCriteriaItems),
		definitionOfDone: serializeChecklist(task.definitionOfDoneItems),
		parentTaskId: task.parentTaskId ?? null,
		parentTaskTitle: task.parentTaskTitle ?? null,
		summaryParentTaskId: task.summaryParentTaskId ?? null,
		summaryParentTaskTitle: task.summaryParentTaskTitle ?? null,
		subtasks: [...(task.subtasks ?? [])],
		subtaskSummaries: [...(task.subtaskSummaries ?? [])],
		summaryChildren: [...(task.summaryChildren ?? [])],
		summaryChildSummaries: [...(task.summaryChildSummaries ?? [])],
		priority: task.priority ?? null,
		branch: task.branch ?? null,
		ordinal: task.ordinal ?? null,
		path,
		source: task.source ?? null,
	};
}

export function serializeDocumentForCli(document: Document): CliDocumentRecord {
	return {
		id: document.id,
		title: document.title,
		type: document.type,
		createdDate: document.createdDate,
		updatedDate: document.updatedDate ?? null,
		tags: [...(document.tags ?? [])],
		name: document.name ?? null,
		path: document.path ?? null,
		lastModified: document.lastModified ?? null,
		isLegacy: document.isLegacy ?? false,
	};
}

export function serializeDecisionForCli(decision: Decision): CliDecisionRecord {
	return {
		id: decision.id,
		title: decision.title,
		date: decision.date,
		status: decision.status,
		context: decision.context,
		decision: decision.decision,
		consequences: decision.consequences,
		alternatives: decision.alternatives ?? null,
	};
}

export function serializeSearchResultsForCli(results: SearchResult[]): CliSearchResult[] {
	return results.map((result) => {
		if (result.type === "task") {
			return {
				type: "task",
				score: result.score,
				task: serializeTaskForCli(result.task),
			};
		}
		if (result.type === "document") {
			return {
				type: "document",
				score: result.score,
				document: serializeDocumentForCli(result.document),
			};
		}
		return {
			type: "decision",
			score: result.score,
			decision: serializeDecisionForCli(result.decision),
		};
	});
}
