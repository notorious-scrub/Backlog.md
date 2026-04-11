---
id: BACK-414
title: Make automated QA Codex launcher work on Windows script-based installs
status: Done
assignee: []
created_date: '2026-04-03 21:51'
updated_date: '2026-04-03 21:55'
labels:
  - bug
  - automation
  - windows
  - p0
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Automated QA can now prove when a run is queued or started, but on this Windows machine the worker cannot actually launch Codex using child_process.spawn with the configured `codex` command. Direct repro shows spawn("codex", ["--version"]) fails with EPERM and spawn("codex.ps1", ["--version"]) fails with EFTYPE, which explains why QA tasks appear started without a Codex child PID or completion.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Automated QA can reliably launch Codex on Windows when the configured command resolves to npm-installed script shims such as codex.ps1
- [ ] #2 Run records capture codexPid when launch succeeds and clear failure evidence when launch does not
- [ ] #3 A regression test or launcher abstraction covers the Windows command-resolution path
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Investigating the Windows Codex launch path used by automated QA. Goal is to make the worker handle npm-installed script shims reliably and record launch evidence correctly.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Changed automated QA Codex launching to use a shell-backed invocation helper on Windows, which allows npm-installed script shims like codex.cmd to launch successfully where direct child_process.spawn failed with EPERM/EFTYPE. Added a regression test for the Windows invocation path and preserved the existing durable run evidence hooks so successful launches can record a child PID and command details. Validation: bun test src/test/automated-qa.test.ts; bunx tsc --noEmit; bunx biome check src/core/automated-qa.ts src/test/automated-qa.test.ts.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
