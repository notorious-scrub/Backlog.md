import { describe, expect, it } from "bun:test";
import {
	buildReopenedHeader,
	getDefaultReopenTargetStatus,
	getReopenTargetStatuses,
	prependReopenedDetails,
} from "./reopen";

describe("reopen utils", () => {
	it("builds a stable reopened header", () => {
		const now = new Date("2026-02-23T17:45:12.000Z");
		expect(buildReopenedHeader(now)).toBe("RE-OPENED at 2026-02-23 17:45:12 UTC");
	});

	it("prepends reopen details above the previous description", () => {
		const now = new Date("2026-02-23T17:45:12.000Z");
		expect(prependReopenedDetails("Original description", "Fix regression", now)).toBe(
			"RE-OPENED at 2026-02-23 17:45:12 UTC\n\nFix regression\n\n=============\n\nOriginal description",
		);
	});

	it("supports empty previous description", () => {
		const now = new Date("2026-02-23T17:45:12.000Z");
		expect(prependReopenedDetails("", "Need another pass", now)).toBe(
			"RE-OPENED at 2026-02-23 17:45:12 UTC\n\nNeed another pass",
		);
	});

	it("derives reopen target statuses and preferred default", () => {
		const targets = getReopenTargetStatuses(["To Do", "In Progress", "Re-Opened", "Done", "Complete"]);
		expect(targets).toEqual(["To Do", "In Progress", "Re-Opened"]);
		expect(getDefaultReopenTargetStatus(targets)).toBe("Re-Opened");
	});

	it("falls back to in-progress when re-opened status is unavailable", () => {
		const targets = getReopenTargetStatuses(["To Do", "In Progress", "Done", "Complete"]);
		expect(targets).toEqual(["To Do", "In Progress"]);
		expect(getDefaultReopenTargetStatus(targets)).toBe("In Progress");
	});
});
