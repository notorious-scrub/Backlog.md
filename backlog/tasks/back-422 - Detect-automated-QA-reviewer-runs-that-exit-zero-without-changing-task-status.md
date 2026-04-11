---
id: BACK-422
title: Detect automated QA reviewer runs that exit zero without changing task status
status: Done
assignee:
  - Codex
created_date: '2026-04-03 23:47'
updated_date: '2026-04-04 00:50'
labels:
  - bug
  - automation
  - infra
  - p1
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Automated QA can record a reviewer run as succeeded when Codex exits zero but the task remains in the trigger status. This was reproduced in CF2 when a usage-limit message appeared in stdout, the task stayed in QA, and the run ledger still marked success. The worker then re-queued the same task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Automated QA marks reviewer runs as failed when the task remains in the trigger status after a supposed success or when known fatal reviewer output is captured.
- [ ] #2 The run ledger and queue state do not report success for reviewer runs that leave the task in QA without a valid terminal backlog mutation.
- [ ] #3 Add targeted tests covering zero-exit-but-no-status-change and provider-usage-limit output.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementing fail-closed reviewer result classification: detect usage-limit banners, mark zero-exit/no-status-change reviewer runs as failed, pause automated QA, and prevent requeue while the task remains in QA.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented fail-closed automated QA reviewer result classification in src/core/automated-qa.ts and added regression coverage in src/test/automated-qa.test.ts for usage-limit output and zero-exit reviewer runs that leave a task in QA. Verified with bun test src/test/automated-qa.test.ts, bunx tsc --noEmit, and bun run check .
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
