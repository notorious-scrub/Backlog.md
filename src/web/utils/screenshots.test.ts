import { describe, expect, it } from "bun:test";
import {
	applyScreenshotReviewInstruction,
	collectScreenshotNames,
	toScreenshotReference,
	toScreenshotUrl,
} from "./screenshots";

describe("screenshot utils", () => {
	it("normalizes screenshot references to backlog/images", () => {
		expect(toScreenshotReference("nested/ss1.png")).toBe("backlog/images/nested/ss1.png");
		expect(toScreenshotReference("images/ss1.png")).toBe("backlog/images/ss1.png");
		expect(toScreenshotReference("backlog/images/ss1.png")).toBe("backlog/images/ss1.png");
		expect(toScreenshotReference("../ss1.png")).toBeNull();
	});

	it("builds screenshot URLs for web preview", () => {
		expect(toScreenshotUrl("backlog/images/nested/ss1.png")).toBe("/images/nested/ss1.png");
		expect(toScreenshotUrl("images/ss1.png")).toBe("/images/ss1.png");
		expect(toScreenshotUrl("ss1.png")).toBe("/images/ss1.png");
		expect(toScreenshotUrl("notes/readme.md")).toBeNull();
	});

	it("collects unique screenshot names without extensions", () => {
		expect(
			collectScreenshotNames([
				"backlog/images/ss1.png",
				"backlog/images/nested/ss2.jpg",
				"backlog/images/ss1.png",
				"https://example.com",
			]),
		).toEqual(["ss1", "ss2"]);
	});

	it("appends and updates the review screenshots instruction in description", () => {
		expect(
			applyScreenshotReviewInstruction("Implement feature", ["backlog/images/ss1.png", "backlog/images/ss2.png"]),
		).toBe("Implement feature\n\nreview screenshots: ss1, ss2");

		expect(
			applyScreenshotReviewInstruction("Implement feature\n\nreview screenshots: old", ["backlog/images/ss9.png"]),
		).toBe("Implement feature\n\nreview screenshots: ss9");

		expect(applyScreenshotReviewInstruction("Existing\n\nreview screenshots: ss1", [])).toBe("Existing");
	});
});
