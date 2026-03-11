// This will be replaced at build time for compiled executables
declare const __EMBEDDED_VERSION__: string | undefined;

function normalizeVersion(value: unknown): string | null {
	if (typeof value !== "string") {
		return null;
	}
	const trimmed = value.trim();
	if (!trimmed) {
		return null;
	}
	// Handle accidental wrapping from shell/build define quoting.
	const cleaned = trimmed.replace(/^[+"'`\s]+|[+"'`\s]+$/g, "");
	return cleaned || null;
}

async function readPackageVersion(pathOrUrl: string | URL): Promise<string | null> {
	try {
		const packageJson = await Bun.file(pathOrUrl).json();
		return normalizeVersion((packageJson as { version?: unknown }).version);
	} catch {
		return null;
	}
}

/**
 * Get the version from package.json or embedded version
 * @returns The version string from package.json or embedded at build time
 */
export async function getVersion(): Promise<string> {
	// If this is a compiled executable with embedded version, use that
	if (typeof __EMBEDDED_VERSION__ !== "undefined") {
		const embedded = normalizeVersion(__EMBEDDED_VERSION__);
		if (embedded) {
			return embedded;
		}
	}

	// In development, resolve package.json relative to this source file first.
	const sourceRelative = await readPackageVersion(new URL("../../package.json", import.meta.url));
	if (sourceRelative) {
		return sourceRelative;
	}

	// Fallback to current working directory package.json.
	const cwdVersion = await readPackageVersion("package.json");
	return cwdVersion ?? "0.0.0";
}
