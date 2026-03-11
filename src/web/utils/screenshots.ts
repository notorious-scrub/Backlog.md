const SCREENSHOT_PREFIX = "backlog/images/";
const IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "webp", "svg", "avif"]);

function normalizeSlashes(value: string): string {
	return value.replace(/\\/g, "/");
}

function trimScreenshotPrefix(value: string): string {
	if (value.startsWith(SCREENSHOT_PREFIX)) {
		return value.slice(SCREENSHOT_PREFIX.length);
	}
	if (value.startsWith("/images/")) {
		return value.slice("/images/".length);
	}
	if (value.startsWith("images/")) {
		return value.slice("images/".length);
	}
	return "";
}

function extractScreenshotStem(path: string): string {
	const normalized = normalizeSlashes(path);
	const fileName = normalized.split("/").pop() ?? normalized;
	const dotIndex = fileName.lastIndexOf(".");
	if (dotIndex <= 0) {
		return fileName;
	}
	return fileName.slice(0, dotIndex);
}

export function toScreenshotReference(relativePath: string): string | null {
	const normalized = normalizeSlashes(relativePath.trim()).replace(/^\.?\//, "");
	if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(normalized)) {
		return null;
	}
	if (!normalized || normalized.includes("..")) {
		return null;
	}
	const withoutPrefix = trimScreenshotPrefix(normalized) || normalized;
	if (!withoutPrefix || withoutPrefix.includes("..")) {
		return null;
	}
	return `${SCREENSHOT_PREFIX}${withoutPrefix}`;
}

export function toScreenshotUrl(referencePath: string): string | null {
	const normalized = normalizeSlashes(referencePath.trim());
	if (/^[a-zA-Z][a-zA-Z\d+\-.]*:\/\//.test(normalized)) {
		return null;
	}
	const withoutPrefix = trimScreenshotPrefix(normalized) || normalized.replace(/^\.?\//, "");
	if (!withoutPrefix || withoutPrefix.includes("..")) {
		return null;
	}
	const lowerPath = withoutPrefix.toLowerCase();
	const dotIndex = lowerPath.lastIndexOf(".");
	const extension = dotIndex >= 0 ? lowerPath.slice(dotIndex + 1) : "";
	if (!IMAGE_EXTENSIONS.has(extension)) {
		return null;
	}
	const encodedPath = withoutPrefix
		.split("/")
		.filter((part) => part.length > 0)
		.map((part) => encodeURIComponent(part))
		.join("/");
	return encodedPath.length > 0 ? `/images/${encodedPath}` : null;
}

export function collectScreenshotNames(referencePaths: string[]): string[] {
	const names: string[] = [];
	const seen = new Set<string>();
	for (const referencePath of referencePaths) {
		const normalizedReference = toScreenshotReference(referencePath);
		if (!normalizedReference) {
			continue;
		}
		const screenshotName = extractScreenshotStem(normalizedReference);
		if (!screenshotName || seen.has(screenshotName)) {
			continue;
		}
		seen.add(screenshotName);
		names.push(screenshotName);
	}
	return names;
}

export function applyScreenshotReviewInstruction(description: string, referencePaths: string[]): string {
	const screenshotNames = collectScreenshotNames(referencePaths);
	const lines = description.split(/\r?\n/);
	const linesWithoutInstruction = lines.filter((line) => !/^\s*review screenshots:\s*/i.test(line));
	const baseText = linesWithoutInstruction.join("\n").trimEnd();
	if (screenshotNames.length === 0) {
		return baseText;
	}
	const instructionLine = `review screenshots: ${screenshotNames.join(", ")}`;
	return baseText.length > 0 ? `${baseText}\n\n${instructionLine}` : instructionLine;
}
