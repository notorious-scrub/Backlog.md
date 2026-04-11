---
id: BACK-435.1
title: Add bulk CLI milestone assignment for multiple tasks
status: Done
assignee:
  - '@codex'
created_date: '2026-04-11 20:22'
updated_date: '2026-04-11 20:38'
labels:
  - milestones
  - cli
  - bulk-edit
dependencies: []
parent_task_id: BACK-435
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Provide a first-class CLI command for setting or clearing a milestone across multiple task IDs in one operation. Reuse normal task edit validation and milestone alias resolution, restrict the operation to local editable tasks, and surface a summary of changed/skipped IDs instead of forcing users into one task edit per command.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The CLI exposes a bulk milestone assignment command for multiple task IDs, including a clear/remove option
- [x] #2 Bulk updates reuse existing task edit semantics and validate task IDs/milestone aliases consistently
- [x] #3 Tests cover successful multi-task updates plus validation or partial-skip behavior
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added the task milestone bulk command for multi-task set and clear flows, reused existing milestone alias resolution and local task edit semantics, and covered changed/skipped-ID behavior in CLI tests.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
