const REOPEN_DIVIDER = "=============";

function formatUtcTimestamp(date: Date): string {
	return date
		.toISOString()
		.replace("T", " ")
		.replace(/\.\d{3}Z$/, " UTC");
}

export function buildReopenedHeader(now: Date = new Date()): string {
	return `RE-OPENED at ${formatUtcTimestamp(now)}`;
}

export function prependReopenedDetails(previousDescription: string, details: string, now: Date = new Date()): string {
	const header = buildReopenedHeader(now);
	const cleanedDetails = details.trim() || "No additional details provided.";
	const cleanedPrevious = previousDescription.trim();

	if (!cleanedPrevious) {
		return `${header}\n\n${cleanedDetails}`;
	}

	return `${header}\n\n${cleanedDetails}\n\n${REOPEN_DIVIDER}\n\n${cleanedPrevious}`;
}

export function getReopenTargetStatuses(statuses: string[]): string[] {
	return statuses
		.map((status) => status.trim())
		.filter((status) => status.length > 0)
		.filter((status) => {
			const normalized = status.toLowerCase();
			return !normalized.includes("done") && !normalized.includes("complete");
		});
}

export function getDefaultReopenTargetStatus(statuses: string[], fallbackStatus = "In Progress"): string {
	if (statuses.length === 0) {
		return fallbackStatus;
	}
	const reopened = statuses.find((status) => status.toLowerCase() === "re-opened");
	if (reopened) {
		return reopened;
	}
	const preferred = statuses.find((status) => status.toLowerCase().includes("progress"));
	return preferred ?? statuses[0] ?? fallbackStatus;
}
