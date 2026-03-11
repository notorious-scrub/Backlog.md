import { describe, expect, it } from "bun:test";
import type { Document } from "../../types";
import { isLegacyDocument, splitDocumentsByLegacy } from "./documents";

const buildDocument = (overrides: Partial<Document>): Document => ({
	id: "doc-1",
	title: "Document",
	type: "other",
	createdDate: "2026-03-06",
	rawContent: "content",
	...overrides,
});

describe("document utils", () => {
	it("detects legacy documents from explicit state or path", () => {
		expect(isLegacyDocument(buildDocument({ isLegacy: true }))).toBe(true);
		expect(isLegacyDocument(buildDocument({ path: "legacy/doc-1 - Old.md" }))).toBe(true);
		expect(isLegacyDocument(buildDocument({ path: "Legacy/doc-1 - Old.md" }))).toBe(true);
		expect(isLegacyDocument(buildDocument({ path: "guides/doc-1 - Current.md" }))).toBe(false);
	});

	it("splits active and legacy documents for sidebar rendering", () => {
		const docs = [
			buildDocument({ id: "doc-1", title: "Current", path: "doc-1 - Current.md" }),
			buildDocument({ id: "doc-2", title: "Legacy", path: "legacy/doc-2 - Legacy.md" }),
		];

		const { activeDocs, legacyDocs } = splitDocumentsByLegacy(docs);
		expect(activeDocs.map((doc) => doc.id)).toEqual(["doc-1"]);
		expect(legacyDocs.map((doc) => doc.id)).toEqual(["doc-2"]);
	});
});
