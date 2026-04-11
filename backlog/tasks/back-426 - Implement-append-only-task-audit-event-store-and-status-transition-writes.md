---
id: BACK-426
title: Implement append-only task audit event store and status transition writes
status: Done
assignee: []
created_date: '2026-04-04 15:38'
updated_date: '2026-04-04 16:58'
labels:
  - backend
  - automation
  - feature
  - p1
dependencies:
  - BACK-416
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement the first durable task audit event store described by doc-4. Append task_status_changed and field-change events from Core.updateTask without mutating task files again, and add a read path for task-scoped event history.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Persist append-only task audit events in a project-scoped JSONL store
- [ ] #2 Emit task_status_changed with timestamps and actor/source context from Core.updateTask without retriggering status callbacks or automation
- [ ] #3 Provide a task-scoped read path with deterministic newest-first pagination or cursor semantics
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented append-only JSONL task audit event storage under backlog/audit-log/events.jsonl, emitted task status/assignee/labels/priority/milestone mutation events from Core.updateTask() with actor/source context, and added newest-first task audit pagination plus regression coverage in task-audit-log.test.ts. Validation: bun run check ., bunx tsc --noEmit, bun test src/test/task-audit-log.test.ts.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
