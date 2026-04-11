import * as clack from "@clack/prompts";
import type { Milestone } from "../types/index.ts";

interface PromptChoice {
	label: string;
	value: string;
	hint?: string;
}

interface MilestoneWizardQuestion {
	type: "text" | "select";
	name: string;
	message: string;
	initial?: string;
	options?: PromptChoice[];
	validate?: (value: string | undefined) => string | undefined;
}

export type MilestoneWizardPromptRunner = (question: MilestoneWizardQuestion) => Promise<Record<string, unknown>>;

export class MilestoneWizardCancelledError extends Error {
	constructor() {
		super("Milestone wizard cancelled.");
	}
}

export interface MilestoneWizardValues {
	title: string;
	description: string;
}

export interface MilestoneWizardOption {
	id: string;
	title: string;
	description?: string;
}

const clackPromptRunner: MilestoneWizardPromptRunner = async (question) => {
	if (question.type === "text") {
		const result = await clack.text({
			message: question.message,
			defaultValue: question.initial,
			validate: question.validate,
		});
		if (clack.isCancel(result)) {
			throw new MilestoneWizardCancelledError();
		}
		return { [question.name]: String(result ?? "") };
	}

	const result = await clack.select({
		message: question.message,
		initialValue: question.initial,
		options: (question.options ?? []).map((option) => ({
			label: option.label,
			value: option.value,
			hint: option.hint,
		})),
	});
	if (clack.isCancel(result)) {
		throw new MilestoneWizardCancelledError();
	}
	return { [question.name]: String(result ?? "") };
};

function normalizeDescription(value: string): string {
	return value.replace(/\r\n/g, "\n").trim();
}

export async function pickMilestoneForEditWizard(params: {
	milestones: MilestoneWizardOption[];
	promptImpl?: MilestoneWizardPromptRunner;
}): Promise<string | undefined> {
	const prompt = params.promptImpl ?? clackPromptRunner;
	const milestones = [...params.milestones].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
	if (milestones.length === 0) {
		return undefined;
	}

	try {
		const response = await prompt({
			type: "select",
			name: "milestoneId",
			message: "Select milestone to edit",
			options: milestones.map((milestone) => ({
				label: `${milestone.id} - ${milestone.title}`,
				value: milestone.id,
				hint: milestone.description?.trim() ? milestone.description.trim() : undefined,
			})),
		});
		const selected = response.milestoneId;
		return typeof selected === "string" ? selected : undefined;
	} catch (error) {
		if (error instanceof MilestoneWizardCancelledError) {
			return undefined;
		}
		throw error;
	}
}

export async function runMilestoneCreateWizard(options?: {
	initialTitle?: string;
	initialDescription?: string;
	promptImpl?: MilestoneWizardPromptRunner;
}): Promise<MilestoneWizardValues | null> {
	const prompt = options?.promptImpl ?? clackPromptRunner;
	try {
		const titleResponse = await prompt({
			type: "text",
			name: "title",
			message: "Milestone title",
			initial: options?.initialTitle ?? "",
			validate: (value) => {
				if (String(value ?? "").trim().length === 0) {
					return "Milestone title is required.";
				}
				return undefined;
			},
		});
		const title = String(titleResponse.title ?? "").trim();

		const descriptionResponse = await prompt({
			type: "text",
			name: "description",
			message: "Milestone description (single-line prompt; Shift+Enter not supported)",
			initial: options?.initialDescription ?? "",
		});

		return {
			title,
			description: normalizeDescription(String(descriptionResponse.description ?? "")),
		};
	} catch (error) {
		if (error instanceof MilestoneWizardCancelledError) {
			return null;
		}
		throw error;
	}
}

export async function runMilestoneEditWizard(options: {
	milestone: Pick<Milestone, "title" | "description">;
	promptImpl?: MilestoneWizardPromptRunner;
}): Promise<{ description: string } | null> {
	const prompt = options.promptImpl ?? clackPromptRunner;
	try {
		const descriptionResponse = await prompt({
			type: "text",
			name: "description",
			message: "Milestone description (single-line prompt; Shift+Enter not supported)",
			initial: options.milestone.description ?? "",
		});

		return {
			description: normalizeDescription(String(descriptionResponse.description ?? "")),
		};
	} catch (error) {
		if (error instanceof MilestoneWizardCancelledError) {
			return null;
		}
		throw error;
	}
}
