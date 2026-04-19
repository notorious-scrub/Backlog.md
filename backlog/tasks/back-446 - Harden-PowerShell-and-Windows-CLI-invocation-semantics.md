---
id: BACK-446
title: Harden PowerShell and Windows CLI invocation semantics
status: Done
assignee:
  - '@codex'
created_date: '2026-04-18 23:23'
updated_date: '2026-04-19 01:17'
labels:
  - windows
  - cli
  - bug
dependencies: []
documentation:
  - >-
    backlog/docs/doc-014 -
    Backlog-CLI-and-Application-Experience-Pain-Points-Report-2026-04-18.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Reduce PowerShell and wrapper fragility for repeated flags, multiword arguments, and multiline text so common create/edit flows work predictably from Windows shells without requiring bespoke argument-array workarounds.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Common task and milestone create/edit flows work from PowerShell without argument loss
- [x] #2 Repeated flags and multiline text survive the supported Windows invocation path intact
- [x] #3 The main CLI docs publish tested PowerShell calling patterns and caveats
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Hardened the repo-local wrapper so source checkouts prefer the live src/cli.ts runtime instead of a stale packaged binary, added wrapper argv-cleaning tests, and verified real PowerShell task and milestone create/edit flows preserve quoted @assignees, repeated flags, and multiline text. Updated the main CLI docs with tested PowerShell patterns and caveats.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
