---
id: BACK-436
title: Add milestone create/edit wizards to the CLI
status: Done
assignee:
  - '@codex'
created_date: '2026-04-11 20:25'
updated_date: '2026-04-11 20:37'
labels:
  - milestones
  - cli
  - wizard
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add milestone create/edit wizard support in TTY mode so milestone flows are not flag-driven only. Reuse the established Clack-based task wizard patterns where practical, while keeping milestone fields intentionally minimal (title + description for create, existing milestone picker/identifier + description for edit, with rename support only if the native edit surface needs it).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 TTY milestone create flow supports an interactive wizard when required inputs are not supplied
- [x] #2 TTY milestone edit flow supports an interactive wizard/picker instead of requiring full flag-driven invocation
- [x] #3 Wizard tests cover happy path, cancellation, and prefilled edit behavior where applicable
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Create a milestone wizard helper using the same Clack prompt conventions as task wizards. 2. Wire milestone add/edit to fall back to the wizard in interactive TTY mode when required inputs are omitted. 3. Add wizard tests for create, edit, and cancellation, then update CLI docs/examples if the invocation surface changes.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added milestone create/edit wizard prompts for TTY flows, including milestone picking, prefilled edit descriptions, cancellation handling, and focused wizard tests.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
