import type { TaskAuditEvent, TaskAuditEventType } from "../../types/index.ts";

export type AuditEventFilter = "all" | "task" | "automation";

export function formatAuditEventType(eventType: TaskAuditEventType): string {
	return eventType.replace(/_/g, " ");
}

export function formatAuditActor(event: TaskAuditEvent): string {
	const actor = event.actor;
	if (actor.kind === "automation") {
		const name = actor.automationName || actor.automationId || actor.agentName || "Automation";
		return `${name}${actor.agentName ? ` · ${actor.agentName}` : ""}`;
	}
	const name = actor.displayName || actor.id || (actor.kind === "user" ? "User" : "System");
	return actor.source ? `${name} · ${actor.source}` : name;
}

export function formatAuditValue(value: unknown): string {
	if (Array.isArray(value)) {
		return value.map((item) => String(item)).join(", ") || "none";
	}
	if (value === null || value === undefined || value === "") {
		return "none";
	}
	if (typeof value === "object") {
		try {
			return JSON.stringify(value);
		} catch {
			return String(value);
		}
	}
	return String(value);
}

export function matchesAuditEventFilter(eventType: TaskAuditEventType, filter: AuditEventFilter): boolean {
	if (filter === "all") {
		return true;
	}
	if (filter === "task") {
		return eventType.startsWith("task_");
	}
	return eventType.startsWith("automation_");
}
