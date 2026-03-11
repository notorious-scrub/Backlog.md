import type { Document } from "../../types";

function normalizeDocumentPath(path: string | undefined): string {
	return (path ?? "").replace(/\\/g, "/").trim();
}

function isLegacyPath(path: string | undefined): boolean {
	return normalizeDocumentPath(path).toLowerCase().startsWith("legacy/");
}

export function isLegacyDocument(document: Pick<Document, "path" | "isLegacy">): boolean {
	if (typeof document.isLegacy === "boolean") {
		return document.isLegacy;
	}
	return isLegacyPath(document.path);
}

export function splitDocumentsByLegacy(documents: Document[]): { activeDocs: Document[]; legacyDocs: Document[] } {
	const activeDocs: Document[] = [];
	const legacyDocs: Document[] = [];

	for (const document of documents) {
		if (isLegacyDocument(document)) {
			legacyDocs.push(document);
			continue;
		}
		activeDocs.push(document);
	}

	return { activeDocs, legacyDocs };
}
