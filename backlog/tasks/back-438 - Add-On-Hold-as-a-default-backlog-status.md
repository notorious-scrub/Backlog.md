---
id: BACK-438
title: Add On Hold as a default backlog status
status: Done
assignee:
  - '@codex'
created_date: '2026-04-11 21:13'
updated_date: '2026-04-11 21:14'
labels:
  - statuses
  - config
  - cli
  - web
dependencies: []
priority: medium
---

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 New projects include On Hold in the default status list without manual config edits
- [x] #2 CLI and web/config surfaces that show default statuses include On Hold consistently
- [x] #3 Focused tests cover the default-status behavior where applicable
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Update shared default status constants and any duplicated fallback providers to include On Hold. 2. Add an explicit On Hold status style so default UI rendering is intentional rather than using the unknown-status fallback. 3. Update docs/tests that assert the default status list and verify the focused status/config paths.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added On Hold to the shared default status list, aligned CLI completion fallbacks and status-icon rendering with the new default, updated default-status docs, and verified the focused status/config test coverage.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
