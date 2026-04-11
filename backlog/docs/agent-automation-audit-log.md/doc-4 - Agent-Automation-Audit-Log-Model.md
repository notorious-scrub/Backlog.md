---
id: doc-4
title: Agent Automation Audit Log Model
type: specification
created_date: '2026-04-04 15:35'
---

# Goal

BACK-416 formalizes a first-class append-only audit log for task status
transitions and agent automation lifecycle events.

The current implementation writes automation activity into task implementation
notes and stores recent automation runs in `automated-qa-runs.json`. That is a
useful stopgap, but it is not a durable operator timeline because notes are
free-form text and status changes are not stored as structured events.

This design keeps implementation notes as a human-authored narrative, but moves
system-generated transition history and agent orchestration history into a
dedicated event stream.

## Event Store

Persist one project-scoped append-only JSONL file:

- `backlog/audit-log/events.jsonl`

Each line is one immutable event object. The file is append-only and sorted by
write order, so replay is deterministic and auditing remains robust even when
multiple task files change.

### Event Schema

```json
{
  "id": "evt_01HYZ8M9R7QYQGHPQ0Y7K5H6XS",
  "taskId": "BACK-416",
  "eventType": "task_status_changed",
  "occurredAt": "2026-04-04T14:45:12.019Z",
  "actor": {
    "kind": "user",
    "id": "seanc",
    "displayName": "Sean",
    "source": "cli"
  },
  "summary": "Task moved from To Do to In Progress",
  "data": {
    "previousStatus": "To Do",
    "nextStatus": "In Progress",
    "previousAssignees": [],
    "nextAssignees": ["@Codex"]
  }
}
```

Required fields:

- `id`: unique event ID generated at append time
- `taskId`: canonical task ID
- `eventType`: machine-readable event type
- `occurredAt`: ISO timestamp in UTC
- `actor`: who or what caused the event
- `summary`: short human-readable message for timeline rendering
- `data`: structured payload for event-specific details

Recommended actor shape:

```ts
interface TaskAuditActor {
	kind: "user" | "automation" | "system";
	id?: string;
	displayName?: string;
	source?: "cli" | "web" | "automation-worker" | "status-callback";
	automationId?: string;
	automationName?: string;
	queueEntryId?: string;
	runId?: string;
	agentName?: string;
	processId?: number;
}
```

For local CLI/web writes, actor identity can be best-effort (`process.env.USERNAME`
or `process.env.USER`) because Backlog.md does not currently have authenticated
user accounts. Automation events must include `automationId`, `automationName`,
`queueEntryId`, and `runId` when available.

## Event Types

### Task lifecycle

- `task_status_changed`
- `task_assignee_changed`
- `task_labels_changed`
- `task_priority_changed`
- `task_milestone_changed`

`task_status_changed` is the minimum implementation slice for BACK-416
follow-up work because `Core.updateTask()` already has the previous task
snapshot and can append one event immediately after `fs.saveTask(task)`
succeeds.

### Agent automation lifecycle

- `automation_run_queued`
- `automation_run_dequeued`
- `automation_task_claimed`
- `automation_reviewer_launching`
- `automation_reviewer_started`
- `automation_reviewer_output`
- `automation_run_succeeded`
- `automation_run_failed`
- `automation_run_skipped`
- `automation_run_abandoned`
- `automation_queue_paused`

These events should be emitted from `src/core/automated-qa.ts` at the same
points that currently mutate `automated-qa-state.json`, append run records, or
write implementation notes.

### Automation event payload

```json
{
  "id": "evt_01HYZ8W3V0F5XYS4TC4BMK2PQV",
  "taskId": "BACK-423",
  "eventType": "automation_run_failed",
  "occurredAt": "2026-04-04T14:51:00.000Z",
  "actor": {
    "kind": "automation",
    "source": "automation-worker",
    "automationId": "automated-qa",
    "automationName": "Automated QA",
    "queueEntryId": "run_01HYZ8V7CJ1M2F88QWAE8BWKV4",
    "runId": "run_01HYZ8V7CJ1M2F88QWAE8BWKV4",
    "agentName": "qa_engineer",
    "processId": 14892
  },
  "summary": "Automated QA failed and paused the automation queue",
  "data": {
    "triggerType": "status_transition",
    "triggerSignature": "status:QA",
    "triggerStatus": "QA",
    "reviewerAssignee": "QA",
    "codexCommand": "codex",
    "workerPid": 14892,
    "codexPid": 22144,
    "exitCode": 1,
    "finalTaskStatus": "QA",
    "error": "Nested Codex launches are disabled during Backlog automated QA reviewer runs."
  }
}
```

## Write Boundaries And Loop Guards

Audit events must be written directly through a filesystem append API, not by
calling `Core.updateTaskFromInput()` again.

Reason: `updateTask()` already triggers status callbacks and automation trigger
matching. If audit writes reused task edits, a system event could create another
task update and accidentally retrigger automation or callback logic.

Concrete boundary rules:

- `Core.updateTask()` may append status/field-change audit events after a task
  save succeeds and after it has the original task snapshot.
- `src/core/automated-qa.ts` may append automation lifecycle events directly
  alongside queue/run-state mutations.
- Audit appends must not mutate task files, run status callbacks, or call
  `handleAutomatedQaTaskChange()`.
- Event ingestion must tolerate process restarts; if an append fails after a
  task save succeeds, the task update should not be rolled back, but the error
  should be surfaced in logs and optionally appended as an `audit_write_failed`
  system event once recovery is available.

## API Surface

Add read APIs that expose the structured event stream without forcing operators
to inspect raw markdown notes or JSON state files:

- `GET /api/tasks/:taskId/audit-log?limit=100&cursor=<eventId>`
  - returns a newest-first timeline for one task
  - supports optional `eventType` filtering
- `GET /api/agent-automations/audit-log?automationId=<id>&taskId=<id>&limit=100&cursor=<eventId>`
  - returns a newest-first global automation stream
  - supports queue/run troubleshooting without opening state files

Response shape:

```json
{
  "events": [
    {
      "id": "evt_01HYZ8W3V0F5XYS4TC4BMK2PQV",
      "taskId": "BACK-423",
      "eventType": "automation_run_failed",
      "occurredAt": "2026-04-04T14:51:00.000Z",
      "actor": {
        "kind": "automation",
        "automationId": "automated-qa",
        "automationName": "Automated QA"
      },
      "summary": "Automated QA failed and paused the automation queue",
      "data": {
        "finalTaskStatus": "QA",
        "exitCode": 1
      }
    }
  ],
  "nextCursor": "evt_01HYZ8M9R7QYQGHPQ0Y7K5H6XS"
}
```

## UI Surface

### Task details

Add an `Activity` or `Audit Log` panel to the task details UI that renders a
timeline from `/api/tasks/:taskId/audit-log`.

The task timeline should:

- show status transitions, actor identity, automation lifecycle events, and key
  metadata such as final task status, queue entry ID, process IDs, and trigger
  signature
- keep implementation notes visible as a separate human-authored section, but
  stop using notes as the primary system event source
- allow filtering to `All`, `Task changes`, and `Automation`

### Automation dashboard

Extend the Settings automation section to read
`/api/agent-automations/audit-log` and show a compact timeline underneath the
queue cards.

The operator should be able to answer these questions without opening
`automated-qa-state.json`, `automated-qa-runs.json`, or task note text:

- Which automation queued this task and why?
- Did the worker claim the task and launch a reviewer process?
- What was the reviewer PID and final exit outcome?
- Why did the queue pause or abandon a run after a restart?

## Migration Plan

1. Add the append-only event store and emit `task_status_changed` from
   `Core.updateTask()`.
2. Dual-write agent automation lifecycle events from `src/core/automated-qa.ts`
   while leaving the existing implementation-note appends in place.
3. Add the task timeline and automation audit APIs/UI.
4. Backfill a best-effort event history from `automated-qa-runs.json` and keep
   legacy note text as historical context only.
5. After the UI is fully event-driven, remove system-generated automation notes
   from implementation notes so that field returns to human-authored progress
   text.

## Implementation Slices

Recommended follow-up tasks:

- Implement `backlog/audit-log/events.jsonl` append/read storage plus
  `task_status_changed` event emission from `Core.updateTask()`.
- Dual-write automation queue/run lifecycle events and expose read APIs for
  task-level and automation-level audit timelines.
- Add task-details and Settings timeline UI backed by the new APIs, then stop
  relying on implementation notes as the primary automation history surface.
