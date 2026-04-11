---
id: BACK-430
title: Automated QA terminal state refresh after reviewer exit
status: Done
assignee:
  - '@Codex'
created_date: '2026-04-05 19:11'
updated_date: '2026-04-05 19:19'
labels:
  - backend
  - bug
  - automation
  - p1
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
CF2 TASK-11 showed stale QA final state after the reviewer moved the task to In Progress. Fix the worker to reread the task from disk before fail-close checks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Worker records the post-review task status from disk before classifying the run.
- [ ] #2 Reviewer-authored moves out of QA do not trigger the stale-QA fail-close path.
- [ ] #3 Regression tests cover the disk-refresh reconciliation path.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Starting fix for stale automated-QA terminal-state reconciliation reproduced by CF2 TASK-11. Plan: refresh task state from disk after reviewer exit, add regression coverage, restart CF2 backlog runtime, and rerun the smoke.

Implemented a disk-refresh reconciliation path in automated-qa.ts so the worker rereads task state from the filesystem after reviewer exit before applying stale-QA fail-close logic. Added a regression test that simulates an external reviewer moving the task from QA to In Progress via direct file save. Local validation passed: bun test src/test/automated-qa.test.ts, bunx tsc --noEmit, bun run check .
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fixed automated QA terminal-state reconciliation by rereading the task from disk after reviewer exit before stale-QA fail-close checks. Added a regression in src/test/automated-qa.test.ts covering an external reviewer moving a task from QA to In Progress via direct filesystem save. Validation passed: bun test src/test/automated-qa.test.ts, bunx tsc --noEmit, bun run check ., then restarted the CF2 backlog runtime on port 6430 and reran smoke task TASK-12, which completed Done with recentRuns.finalTaskStatus=Done and structured audit events through automation_run_succeeded without queue fail-close.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
