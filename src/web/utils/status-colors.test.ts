import { describe, expect, it } from "bun:test";
import {
	getDefaultStatusColor,
	getStatusBadgeStyle,
	normalizeHexColor,
	normalizeStatusColorMap,
	resolveStatusColor,
} from "./status-colors";

describe("status-colors", () => {
	it("normalizes hex values", () => {
		expect(normalizeHexColor("#abc")).toBe("#aabbcc");
		expect(normalizeHexColor("#AABBCC")).toBe("#aabbcc");
		expect(normalizeHexColor("not-a-color")).toBeNull();
	});

	it("uses defaults for known statuses", () => {
		expect(getDefaultStatusColor("To Do")).toBe("#6b7280");
		expect(getDefaultStatusColor("In Progress")).toBe("#2563eb");
		expect(getDefaultStatusColor("Done")).toBe("#16a34a");
	});

	it("prefers configured colors when valid", () => {
		expect(resolveStatusColor("Blocked", { Blocked: "#ff9900" })).toBe("#ff9900");
		expect(resolveStatusColor("Blocked", { Blocked: "invalid" })).toBe("#6b7280");
	});

	it("matches configured colors by trimmed case-insensitive status keys", () => {
		expect(resolveStatusColor("On Hold", { " on hold ": "#123abc" })).toBe("#123abc");
	});

	it("normalizes color maps to current statuses", () => {
		expect(normalizeStatusColorMap(["To Do", "Blocked"], { Blocked: "#f00" })).toEqual({
			"To Do": "#6b7280",
			Blocked: "#ff0000",
		});
	});

	it("returns badge style values", () => {
		const style = getStatusBadgeStyle("Done", { Done: "#00ff00" });
		expect(style.backgroundColor).toBe("#00ff001f");
		expect(style.borderColor).toBe("#00ff0066");
		expect(style.color.length).toBeGreaterThan(0);
	});
});
