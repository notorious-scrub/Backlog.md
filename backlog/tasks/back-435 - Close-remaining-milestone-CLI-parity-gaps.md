---
id: BACK-435
title: Close remaining milestone CLI parity gaps
status: Done
assignee:
  - '@codex'
created_date: '2026-04-11 20:22'
updated_date: '2026-04-11 20:37'
labels:
  - milestones
  - cli
  - enhancement
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Close the remaining milestone CLI parity gaps that are still intentionally lighter than task workflows. This wave should add interactive milestone create/edit wizards in TTY flows, milestone-aware filtering on backlog search, and a first-class bulk CLI command for setting/clearing milestones across multiple task IDs while preserving existing milestone alias resolution rules and local-task edit semantics.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Milestone create/edit can run as interactive TTY wizards instead of requiring only flag-driven input
- [x] #2 backlog search accepts milestone filtering for task results and preserves current behavior for non-task result types
- [x] #3 The CLI provides a bulk milestone assignment flow for multiple task IDs, including clear/reassign semantics and focused validation/tests/docs
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a minimal milestone wizard module patterned after the existing task wizard so milestone add/edit can run interactively in TTY mode with cancellation and prefilled edit values. 2. Extend the shared search filters and CLI search command with milestone-aware task filtering while leaving document/decision results unaffected. 3. Add a bulk milestone assignment CLI command that reuses existing task edit and milestone resolution semantics for multiple local task IDs. 4. Add focused tests and doc updates for all three flows, then finalize the child tasks and parent umbrella with verification evidence.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Attempted to split this wave into subtasks, but current subtask ID allocation reused BACK-435.1 and overwrote earlier child creates. Tracking is normalized as BACK-435 (umbrella), BACK-435.1 (bulk milestone assignment), BACK-436 (milestone wizards), and BACK-437 (search milestone filter) until hierarchical subtask allocation is fixed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Closed the remaining milestone CLI parity gaps with TTY milestone add/edit prompts, milestone-aware search filtering, and a bulk task milestone set/clear command, backed by focused tests and doc updates.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
