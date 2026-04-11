---
id: BACK-427
title: Dual-write agent automation lifecycle events and expose audit-log APIs
status: Done
assignee: []
created_date: '2026-04-04 15:38'
updated_date: '2026-04-04 16:58'
labels:
  - backend
  - api
  - automation
  - feature
  - p1
dependencies:
  - BACK-416
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Record structured automation queue and reviewer lifecycle events alongside the existing run ledger, and expose task-level and automation-level audit APIs so operators no longer need implementation notes or raw state files as the primary source of truth.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Persist automation_run_queued, automation_task_claimed, reviewer launch/start, success/failure, skipped, abandoned, and queue-paused events with automation/run metadata
- [ ] #2 Expose task-level and automation-level audit-log APIs with filters for taskId, automationId, and eventType
- [ ] #3 Keep existing implementation-note writes as a compatibility stopgap while the UI migrates to the event stream
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Dual-wrote automated QA lifecycle events into the structured audit log while preserving implementation-note writes, exposed task-scoped and automation-scoped audit-log APIs with task/event/automation filters, and covered queue/reviewer lifecycle events plus API filtering in automated-qa.test.ts and server-config-endpoint.test.ts. Validation: bun run check ., bunx tsc --noEmit, bun test src/test/automated-qa.test.ts, bun test src/test/server-config-endpoint.test.ts.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
