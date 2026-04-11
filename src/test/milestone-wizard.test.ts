import { describe, expect, it } from "bun:test";
import {
	MilestoneWizardCancelledError,
	type MilestoneWizardPromptRunner,
	pickMilestoneForEditWizard,
	runMilestoneCreateWizard,
	runMilestoneEditWizard,
} from "../commands/milestone-wizard.ts";

type PromptResponses = Record<string, string | string[]>;

function createPromptRunner(responses: PromptResponses): MilestoneWizardPromptRunner {
	const state = new Map<string, string[]>();
	for (const [key, value] of Object.entries(responses)) {
		state.set(key, Array.isArray(value) ? [...value] : [value]);
	}

	return async (question) => {
		const queue = state.get(question.name) ?? [];
		if (queue.length === 0) {
			return { [question.name]: question.initial ?? "" };
		}
		while (queue.length > 0) {
			const candidate = queue.shift() ?? "";
			const validationResult = question.validate?.(candidate);
			if (!validationResult) {
				state.set(question.name, queue);
				return { [question.name]: candidate };
			}
		}
		throw new Error(`No valid prompt value remaining for '${question.name}'.`);
	};
}

describe("milestone wizard", () => {
	it("builds create values from wizard prompts", async () => {
		const prompt = createPromptRunner({
			title: "Release 1.0",
			description: "Ship criteria",
		});

		const values = await runMilestoneCreateWizard({ promptImpl: prompt });

		expect(values).toEqual({
			title: "Release 1.0",
			description: "Ship criteria",
		});
	});

	it("prefills edit description values", async () => {
		const prompt = createPromptRunner({
			description: "Updated scope",
		});

		const values = await runMilestoneEditWizard({
			milestone: { title: "Release 1.0", description: "Original scope" },
			promptImpl: prompt,
		});

		expect(values).toEqual({ description: "Updated scope" });
	});

	it("supports edit picker flow", async () => {
		const prompt = createPromptRunner({
			milestoneId: "m-2",
		});

		const selected = await pickMilestoneForEditWizard({
			milestones: [
				{ id: "m-3", title: "Third" },
				{ id: "m-2", title: "Second" },
				{ id: "m-1", title: "First" },
			],
			promptImpl: prompt,
		});

		expect(selected).toBe("m-2");
	});

	it("returns null or undefined when cancelled", async () => {
		const cancelledPrompt: MilestoneWizardPromptRunner = async () => {
			throw new MilestoneWizardCancelledError();
		};

		expect(await runMilestoneCreateWizard({ promptImpl: cancelledPrompt })).toBeNull();
		expect(
			await runMilestoneEditWizard({
				milestone: { title: "Release 1.0", description: "Scope" },
				promptImpl: cancelledPrompt,
			}),
		).toBeNull();
		expect(
			await pickMilestoneForEditWizard({
				milestones: [{ id: "m-1", title: "Release 1.0" }],
				promptImpl: cancelledPrompt,
			}),
		).toBeUndefined();
	});
});
