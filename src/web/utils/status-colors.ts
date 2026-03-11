const DEFAULT_STATUS_COLORS_BY_KEY: Record<string, string> = {
	"to do": "#6b7280",
	"in progress": "#2563eb",
	done: "#16a34a",
};

const FALLBACK_STATUS_COLOR = "#6b7280";

function normalizeStatusKey(status: string): string {
	return status.trim().toLowerCase();
}

export function normalizeHexColor(color: string | undefined): string | null {
	if (!color) return null;
	const normalized = color.trim().toLowerCase();
	const shortMatch = normalized.match(/^#([0-9a-f]{3})$/i);
	if (shortMatch?.[1]) {
		const value = shortMatch[1];
		return `#${value[0]}${value[0]}${value[1]}${value[1]}${value[2]}${value[2]}`;
	}
	const longMatch = normalized.match(/^#([0-9a-f]{6})$/i);
	return longMatch ? `#${longMatch[1]}` : null;
}

export function getDefaultStatusColor(status: string): string {
	const key = normalizeStatusKey(status);
	return DEFAULT_STATUS_COLORS_BY_KEY[key] ?? FALLBACK_STATUS_COLOR;
}

export function resolveStatusColor(status: string, statusColors?: Record<string, string>): string {
	const normalizedConfigured = normalizeHexColor(statusColors?.[status]);
	if (normalizedConfigured) {
		return normalizedConfigured;
	}
	const normalizedStatusKey = normalizeStatusKey(status);
	for (const [configuredStatus, configuredColor] of Object.entries(statusColors ?? {})) {
		if (normalizeStatusKey(configuredStatus) !== normalizedStatusKey) {
			continue;
		}
		const normalized = normalizeHexColor(configuredColor);
		if (normalized) {
			return normalized;
		}
	}
	return getDefaultStatusColor(status);
}

export function normalizeStatusColorMap(
	statuses: string[],
	statusColors?: Record<string, string>,
): Record<string, string> {
	const normalized: Record<string, string> = {};
	for (const status of statuses) {
		const trimmed = status.trim();
		if (!trimmed) continue;
		normalized[trimmed] = resolveStatusColor(trimmed, statusColors);
	}
	return normalized;
}

function hexToRgb(color: string): { r: number; g: number; b: number } | null {
	const normalized = normalizeHexColor(color);
	if (!normalized) return null;
	return {
		r: Number.parseInt(normalized.slice(1, 3), 16),
		g: Number.parseInt(normalized.slice(3, 5), 16),
		b: Number.parseInt(normalized.slice(5, 7), 16),
	};
}

function getReadableTextColor(backgroundColor: string): string {
	const rgb = hexToRgb(backgroundColor);
	if (!rgb) return "#111827";
	const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
	return luminance > 0.6 ? "#111827" : "#f9fafb";
}

function withAlpha(color: string, alphaHex: string): string {
	const normalized = normalizeHexColor(color);
	if (!normalized) return `${FALLBACK_STATUS_COLOR}${alphaHex}`;
	return `${normalized}${alphaHex}`;
}

export function getStatusBadgeStyle(
	status: string,
	statusColors?: Record<string, string>,
): {
	backgroundColor: string;
	color: string;
	borderColor: string;
} {
	const baseColor = resolveStatusColor(status, statusColors);
	return {
		backgroundColor: withAlpha(baseColor, "1f"),
		color: getReadableTextColor(baseColor),
		borderColor: withAlpha(baseColor, "66"),
	};
}
