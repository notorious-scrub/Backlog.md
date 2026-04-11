---
id: BACK-437
title: Add milestone filtering to backlog search
status: Done
assignee:
  - '@codex'
created_date: '2026-04-11 20:25'
updated_date: '2026-04-11 20:37'
labels:
  - milestones
  - cli
  - search
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend the shared CLI search flow so task results can be filtered by milestone id/title/alias in the same way task list already supports. The filter must only constrain task results and should not incorrectly exclude matching documents or decisions when mixed result types are requested.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 backlog search supports a milestone filter that resolves milestone ids, numeric aliases, and titles consistently with other milestone-aware CLI commands
- [x] #2 Task search filtering respects the milestone filter for query and no-query paths
- [x] #3 CLI search tests cover milestone filtering and ensure non-task result handling remains correct
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a milestone filter to backlog search, extended shared task search filtering for configured and no-milestone cases, preserved document/decision matches, and added CLI search coverage.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
