---
id: BACK-421
title: Make automated QA timeout configurable and tighten terminal reviewer behavior
status: Done
assignee:
  - Codex
created_date: '2026-04-03 23:39'
updated_date: '2026-04-03 23:48'
labels:
  - feature
  - automation
  - infra
  - p1
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Automated QA should not hard-code a 180 second timeout, and nested reviewer runs should stop after recording the QA decision instead of offering to keep reviewing more tasks. Add a configurable timeout field to automated QA settings/config and refine the reviewer prompt to terminate cleanly after backlog mutation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Automated QA timeout is configurable in Backlog.md config and Settings UI with a sensible default.
- [ ] #2 The automated QA runner uses the configured timeout instead of a hard-coded constant.
- [ ] #3 Reviewer prompt explicitly stops after writing the QA decision and avoids offering additional work after completion.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementing configurable automated QA timeout and terminal-reviewer prompt refinement now.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented configurable automated QA timeout and terminal reviewer prompt hardening.

Changes:
- Added automatedQa.timeoutSeconds with a 180-second default.
- Wired timeoutSeconds through config parsing, normalization, server validation, and Settings UI.
- Updated the automated QA runner to use the configured timeout instead of a hard-coded 180s value.
- Tightened the reviewer prompt to stop immediately after writing the backlog verdict and not offer extra follow-up help.

Validation:
- bun test src/test/automated-qa.test.ts
- bun test src/test/server-config-endpoint.test.ts
- bunx tsc --noEmit
- bun run check src/core/automated-qa.ts src/types/index.ts src/file-system/operations.ts src/server/index.ts src/web/components/Settings.tsx src/test/automated-qa.test.ts src/test/server-config-endpoint.test.ts README.md ADVANCED-CONFIG.md
- Live CF2 config round-trip on http://localhost:6430 persisted automated_qa.timeoutSeconds = 420 and surfaced it through /api/automated-qa.

Follow-up:
- A fresh CF2 smoke task exposed a separate automation defect where a reviewer can exit 0 after a usage-limit error while leaving the task in QA. Captured as BACK-422.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
