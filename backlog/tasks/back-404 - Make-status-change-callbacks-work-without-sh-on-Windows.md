---
id: BACK-404
title: Make status change callbacks work without sh on Windows
status: Done
assignee:
  - '@codex'
created_date: '2026-04-03 21:04'
updated_date: '2026-04-03 21:16'
labels:
  - bug
  - automation
  - windows
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The current status callback implementation shells out through `sh -c`, which fails on Windows environments that do not have a POSIX shell on PATH. This breaks the existing status-callback regression suite with `ENOENT: uv_spawn 'sh'` and makes project-level `onStatusChange` callbacks unreliable on stock Windows setups.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Status change callbacks execute successfully on Windows environments without requiring `sh` on PATH.
- [ ] #2 The existing status-callback test suite passes on Windows with an explicit cross-platform shell strategy or callback runner.
- [ ] #3 Documentation clarifies any shell syntax expectations or compatibility limits.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Starting Windows callback runner fix. Replacing sh-based status callback execution with Bun's cross-platform shell while keeping existing callback syntax, then validating with the current regression suite and CF2 enablement.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Reworked status-change callback execution to keep sh-based behavior on Unix while using a PowerShell-backed runner on Windows. Windows callbacks now translate -style variables, simple stderr echo redirection, and && chaining without requiring sh on PATH. Validation: bun test src/test/status-callback.test.ts; bun test src/test/automated-qa.test.ts src/test/server-config-endpoint.test.ts; bunx tsc --noEmit.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
