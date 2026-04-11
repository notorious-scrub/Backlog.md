---
id: BACK-425
title: Treat nested Codex guard failures as non-requeueing automated QA failures
status: Done
assignee:
  - Codex
created_date: '2026-04-04 00:56'
updated_date: '2026-04-04 00:59'
labels:
  - bug
  - automation
  - infra
  - p0
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CF2 TASK-10 smoke testing showed the generated nested-Codex guard shim correctly blocks `codex exec`, but the failed QA task remains in backlog/automated-qa-state.json queuedTaskIds. Classify guard-shim failures as non-requeueing terminal failures and pause automated QA so a policy violation cannot sit queued for repeated retries.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Nested-Codex guard shim output marks the reviewer run as failed, clears the task from queuedTaskIds, and pauses automated QA.
- [ ] #2 Add regression coverage for a reviewer failure containing the nested Codex guard message.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementing fail-closed queue handling for nested Codex guard-shim failures discovered during CF2 TASK-10 smoke testing.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Classified nested-Codex guard-shim output as a non-requeueing, fail-closed automated QA failure in src/core/automated-qa.ts, added queue-level regression coverage in src/test/automated-qa.test.ts, and smoke-tested the fix against CF2 TASK-10 using qa-worker. Validation: bun test src/test/automated-qa.test.ts, bunx tsc --noEmit, bun run check .
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
