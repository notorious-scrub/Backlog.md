---
id: BACK-436
title: Add milestone create/edit wizards to the CLI
status: To Do
assignee:
  - '@codex'
created_date: '2026-04-11 20:23'
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
- [ ] #1 TTY milestone create flow supports an interactive wizard when required inputs are not supplied
- [ ] #2 TTY milestone edit flow supports an interactive wizard/picker instead of requiring full flag-driven invocation
- [ ] #3 Wizard tests cover happy path, cancellation, and prefilled edit behavior where applicable
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
