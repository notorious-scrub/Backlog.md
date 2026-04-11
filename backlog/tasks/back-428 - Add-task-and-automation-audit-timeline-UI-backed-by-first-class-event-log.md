---
id: BACK-428
title: Add task and automation audit timeline UI backed by first-class event log
status: Done
assignee: []
created_date: '2026-04-04 15:38'
updated_date: '2026-04-04 16:58'
labels:
  - frontend
  - automation
  - feature
  - p1
dependencies:
  - BACK-416
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Surface the new audit event stream in the task details UI and automation Settings dashboard so operators can inspect status transitions, reviewer launch/completion, queue pauses, and run metadata without reading implementation notes or JSON files.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Task details UI shows a structured activity/audit timeline from the task audit API with task-change and automation filters
- [ ] #2 Settings automation section shows recent automation audit events with task, automation, trigger, queue entry, and process metadata
- [ ] #3 Implementation Notes remain visible as human-authored narrative but are no longer the primary system history surface
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added task-level Audit Log timeline UI in TaskDetailsModal and Automation Audit Log in Settings, backed by the new audit APIs with task/automation filters and shared event-formatting helpers, while keeping Implementation Notes visible as human-authored narrative. Validation: bun run check ., bunx tsc --noEmit, bun test src/test/web-task-details-modal-final-summary.test.tsx.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
