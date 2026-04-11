---
id: BACK-436
title: Add milestone filtering to backlog search
status: To Do
assignee:
  - '@codex'
created_date: '2026-04-11 20:23'
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
- [ ] #1 backlog search supports a milestone filter that resolves milestone ids, numeric aliases, and titles consistently with other milestone-aware CLI commands
- [ ] #2 Task search filtering respects the milestone filter for query and no-query paths
- [ ] #3 CLI search tests cover milestone filtering and ensure non-task result handling remains correct
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
