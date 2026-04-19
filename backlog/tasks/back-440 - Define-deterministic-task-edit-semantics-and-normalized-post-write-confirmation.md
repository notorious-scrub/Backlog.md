---
id: BACK-440
title: >-
  Define deterministic task edit semantics and normalized post-write
  confirmation
status: Done
assignee:
  - '@codex'
created_date: '2026-04-18 23:23'
updated_date: '2026-04-18 23:34'
labels:
  - cli
  - governance
  - bug
dependencies: []
documentation:
  - >-
    backlog/docs/doc-014 -
    Backlog-CLI-and-Application-Experience-Pain-Points-Report-2026-04-18.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Close the trust gap in task edit by defining explicit replace/append/clear semantics for mutable fields and returning an authoritative normalized post-write confirmation that matches persisted markdown state. This should cover repeated flags, list-like fields, and PowerShell-driven multi-field edits that currently require direct file inspection after CLI success.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Mutable task edit fields have documented replace, append, and clear semantics where applicable
- [x] #2 Task edit success output shows a normalized persisted snapshot or change summary that is sufficient to trust the write without opening the markdown file
- [x] #3 Focused tests cover repeated flags, multiline text, and PowerShell-safe multi-field edits
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented the first trust-contract slice: task edit now treats --acceptance-criteria as full-set replacement, keeps --ac as append semantics, includes the persisted file path in non-plain success output, and documents the replace/append rules in CLI help docs. Verification: bun test src/test/acceptance-criteria.test.ts src/test/cli-auto-plain-non-tty.test.ts; bunx tsc --noEmit; bun run check .

Additional verification for the final slice: bun test src/test/task-edit-preservation.test.ts src/test/acceptance-criteria.test.ts src/test/cli-auto-plain-non-tty.test.ts src/test/cli-task-wizard.test.ts; bunx tsc --noEmit; bun run check .
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Defined and documented deterministic task-edit semantics, fixed the edit-time acceptance-criteria replace contract, and upgraded non-plain task edit output to show the persisted post-write snapshot so the CLI itself is authoritative after writes.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
