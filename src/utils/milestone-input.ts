import type { Milestone } from "../types/index.ts";

/**
 * Resolves user milestone input to a canonical milestone id string, matching
 * active milestones first, then archived titles/ids, then falling back to the
 * trimmed input (for free-form labels). Used by the web server and CLI.
 */
export function resolveMilestoneInputFromLists(
	activeMilestones: Milestone[],
	archivedMilestones: Milestone[],
	milestone: string,
): string {
	const normalized = milestone.trim();
	if (!normalized) {
		return normalized;
	}

	const key = normalized.toLowerCase();
	const aliasKeys = new Set<string>([key]);
	const looksLikeMilestoneId = /^\d+$/.test(normalized) || /^m-\d+$/i.test(normalized);
	const canonicalInputId =
		/^\d+$/.test(normalized) || /^m-\d+$/i.test(normalized)
			? `m-${String(Number.parseInt(normalized.replace(/^m-/i, ""), 10))}`
			: null;
	if (/^\d+$/.test(normalized)) {
		const numeric = String(Number.parseInt(normalized, 10));
		aliasKeys.add(numeric);
		aliasKeys.add(`m-${numeric}`);
	} else {
		const match = normalized.match(/^m-(\d+)$/i);
		if (match?.[1]) {
			const numeric = String(Number.parseInt(match[1], 10));
			aliasKeys.add(numeric);
			aliasKeys.add(`m-${numeric}`);
		}
	}
	const idMatchesAlias = (milestoneId: string): boolean => {
		const idKey = milestoneId.trim().toLowerCase();
		if (aliasKeys.has(idKey)) {
			return true;
		}
		if (/^\d+$/.test(milestoneId.trim())) {
			const numeric = String(Number.parseInt(milestoneId.trim(), 10));
			return aliasKeys.has(numeric) || aliasKeys.has(`m-${numeric}`);
		}
		const idMatch = milestoneId.trim().match(/^m-(\d+)$/i);
		if (!idMatch?.[1]) {
			return false;
		}
		const numeric = String(Number.parseInt(idMatch[1], 10));
		return aliasKeys.has(numeric) || aliasKeys.has(`m-${numeric}`);
	};
	const findIdMatch = (milestones: Array<{ id: string; title: string }>): { id: string; title: string } | undefined => {
		const rawExactMatch = milestones.find((item) => item.id.trim().toLowerCase() === key);
		if (rawExactMatch) {
			return rawExactMatch;
		}
		if (canonicalInputId) {
			const canonicalRawMatch = milestones.find((item) => item.id.trim().toLowerCase() === canonicalInputId);
			if (canonicalRawMatch) {
				return canonicalRawMatch;
			}
		}
		return milestones.find((item) => idMatchesAlias(item.id));
	};
	const findUniqueTitleMatch = (
		milestones: Array<{ id: string; title: string }>,
	): { id: string; title: string } | null => {
		const titleMatches = milestones.filter((item) => item.title.trim().toLowerCase() === key);
		if (titleMatches.length === 1) {
			return titleMatches[0] ?? null;
		}
		return null;
	};

	const matchByAlias = (milestones: Array<{ id: string; title: string }>): string | null => {
		const idMatch = findIdMatch(milestones);
		const titleMatch = findUniqueTitleMatch(milestones);
		if (looksLikeMilestoneId) {
			return idMatch?.id ?? null;
		}
		if (titleMatch) {
			return titleMatch.id;
		}
		if (idMatch) {
			return idMatch.id;
		}
		return null;
	};

	const activeTitleMatches = activeMilestones.filter((item) => item.title.trim().toLowerCase() === key);
	const hasAmbiguousActiveTitle = activeTitleMatches.length > 1;
	if (looksLikeMilestoneId) {
		const activeIdMatch = findIdMatch(activeMilestones);
		if (activeIdMatch) {
			return activeIdMatch.id;
		}
		const archivedIdMatch = findIdMatch(archivedMilestones);
		if (archivedIdMatch) {
			return archivedIdMatch.id;
		}
		if (activeTitleMatches.length === 1) {
			return activeTitleMatches[0]?.id ?? normalized;
		}
		if (hasAmbiguousActiveTitle) {
			return normalized;
		}
		const archivedTitleMatch = findUniqueTitleMatch(archivedMilestones);
		return archivedTitleMatch?.id ?? normalized;
	}

	const activeMatch = matchByAlias(activeMilestones);
	if (activeMatch) {
		return activeMatch;
	}
	if (hasAmbiguousActiveTitle) {
		return normalized;
	}

	const archivedMatch = matchByAlias(archivedMilestones);
	if (archivedMatch) {
		return archivedMatch;
	}

	return normalized;
}
