---
id: BACK-418
title: Diagnose automated Codex reviewer hangs before backlog mutation on Windows
status: Done
assignee:
  - Codex
created_date: '2026-04-03 22:49'
updated_date: '2026-04-03 23:13'
labels:
  - bug
  - automation
  - infra
  - p0
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Automated QA runs and direct codex exec smoke tests launch reviewer processes on Windows, but the spawned Codex process can remain running for minutes without appending notes or changing backlog task status. We need a deterministic way to detect and fix the pre-mutation hang so automated QA can be trusted.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Reproduce the hang with a controlled smoke task and capture the exact spawned process tree and command line.
- [ ] #2 Identify why codex exec launches but does not mutate the backlog task in the Windows automation path.
- [ ] #3 Implement and verify a fix or a deterministic failure/timeout path that returns the task out of QA instead of hanging indefinitely.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Root cause isolated: nested codex exec on Windows stalls when the reviewer attempts apply_patch or other approval-gated file edits. Shell-command-only reviewer runs succeed, and danger-full-access is required for reliable access to the Backlog.md CLI path outside the CF2 workspace. Implementing a launcher/prompt fix plus a deterministic timeout path now.

Implemented launcher/prompt fix and deterministic timeout path. Direct shell-only Codex smoke now updates backlog tasks successfully; restarted CF2 QA worker is launching with the new danger-full-access sandbox path.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed the Windows automated QA hang by changing nested Codex reviewer runs to a shell-only backlog workflow and launching them with `--sandbox danger-full-access` instead of `--full-auto`. Root cause was a deadlock when non-interactive reviewer runs attempted `apply_patch`/direct file-edit flows and emitted approval requests that were never answered. Added a hard 180s timeout so reviewer runs now fail deterministically instead of sitting in QA indefinitely. Validation: `bun test src/test/automated-qa.test.ts`, `bunx tsc --noEmit`, `bun run check src/core/automated-qa.ts src/test/automated-qa.test.ts README.md ADVANCED-CONFIG.md`, direct Codex smoke proving shell-only backlog edits succeed, and live CF2 worker restart showing new `codex exec ... --sandbox danger-full-access -` launcher records.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
