export interface WebRuntimeInfo {
	version: string;
	projectRoot: string | null;
	projectName: string | null;
	runtimeEntry: string | null;
	capabilityMismatch: boolean;
	warnings: string[];
}

const REQUIRED_CAPABILITIES = ["runtimeMetadata", "cliJson", "validate"] as const;

export async function getWebRuntimeInfo(): Promise<WebRuntimeInfo> {
	try {
		const response = await fetch("/api/version");
		const data = (await response.json()) as {
			version?: unknown;
			project?: { root?: unknown; name?: unknown };
			runtime?: { entry?: unknown };
			capabilities?: Record<string, unknown>;
		};
		const capabilityMismatch = REQUIRED_CAPABILITIES.some((capability) => data.capabilities?.[capability] !== true);
		const warnings = capabilityMismatch
			? ["Runtime metadata is incomplete. The browser may be talking to an older or incompatible server."]
			: [];

		return {
			version: typeof data.version === "string" ? data.version : "",
			projectRoot: typeof data.project?.root === "string" ? data.project.root : null,
			projectName: typeof data.project?.name === "string" ? data.project.name : null,
			runtimeEntry: typeof data.runtime?.entry === "string" ? data.runtime.entry : null,
			capabilityMismatch,
			warnings,
		};
	} catch {
		return {
			version: "",
			projectRoot: null,
			projectName: null,
			runtimeEntry: null,
			capabilityMismatch: true,
			warnings: ["Runtime metadata is unavailable because /api/version could not be loaded."],
		};
	}
}

export async function getWebVersion(): Promise<string> {
	const info = await getWebRuntimeInfo();
	return info.version;
}
