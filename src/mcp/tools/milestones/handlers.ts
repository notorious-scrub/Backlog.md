import {
	addMilestoneForProject,
	buildMilestoneListReport,
	MilestoneMutationError,
	removeMilestoneForProject,
	renameMilestoneForProject,
} from "../../../core/milestone-mutations.ts";
import { McpError } from "../../errors/mcp-errors.ts";
import type { McpServer } from "../../server.ts";
import type { CallToolResult } from "../../types.ts";

export type MilestoneAddArgs = {
	name: string;
	description?: string;
};

export type MilestoneRenameArgs = {
	from: string;
	to: string;
	updateTasks?: boolean;
};

export type MilestoneRemoveArgs = {
	name: string;
	taskHandling?: "clear" | "keep" | "reassign";
	reassignTo?: string;
};

export type MilestoneArchiveArgs = {
	name: string;
};

function mapMutationError(error: unknown): never {
	if (error instanceof MilestoneMutationError) {
		throw new McpError(error.message, error.mcpCode);
	}
	throw error;
}

export class MilestoneHandlers {
	constructor(private readonly core: McpServer) {}

	async listMilestones(): Promise<CallToolResult> {
		const text = await buildMilestoneListReport(this.core);
		return {
			content: [
				{
					type: "text",
					text,
				},
			],
		};
	}

	async addMilestone(args: MilestoneAddArgs): Promise<CallToolResult> {
		try {
			const milestone = await addMilestoneForProject(this.core, args.name, args.description);
			return {
				content: [
					{
						type: "text",
						text: `Created milestone "${milestone.title}" (${milestone.id}).`,
					},
				],
			};
		} catch (error) {
			mapMutationError(error);
		}
	}

	async renameMilestone(args: MilestoneRenameArgs): Promise<CallToolResult> {
		try {
			const text = await renameMilestoneForProject(this.core, {
				from: args.from,
				to: args.to,
				updateTasks: args.updateTasks,
			});
			return {
				content: [
					{
						type: "text",
						text,
					},
				],
			};
		} catch (error) {
			mapMutationError(error);
		}
	}

	async removeMilestone(args: MilestoneRemoveArgs): Promise<CallToolResult> {
		try {
			const text = await removeMilestoneForProject(this.core, {
				name: args.name,
				taskHandling: args.taskHandling,
				reassignTo: args.reassignTo,
			});
			return {
				content: [
					{
						type: "text",
						text,
					},
				],
			};
		} catch (error) {
			mapMutationError(error);
		}
	}

	async archiveMilestone(args: MilestoneArchiveArgs): Promise<CallToolResult> {
		const name = args.name.trim();
		if (!name) {
			throw new McpError("Milestone name cannot be empty.", "VALIDATION_ERROR");
		}

		const result = await this.core.archiveMilestone(name);
		if (!result.success) {
			throw new McpError(`Milestone not found: "${name}"`, "NOT_FOUND");
		}

		const label = result.milestone?.title ?? name;
		const id = result.milestone?.id;

		return {
			content: [
				{
					type: "text",
					text: `Archived milestone "${label}"${id ? ` (${id})` : ""}.`,
				},
			],
		};
	}
}
