---
id: BACK-407
title: Clear stale automated QA active state when a fresh worker starts
status: Done
assignee: []
created_date: '2026-04-03 21:30'
updated_date: '2026-04-03 21:31'
labels:
  - bug
  - automation
  - cli
  - p1
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Automated QA state can retain stale activeTaskIds after a worker process exits unexpectedly or the browser server restarts. This makes /api/automated-qa look like multiple QA reviews are still active when no worker lock exists. A new worker should clear stale active state before draining the queue.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Fresh QA workers clear stale activeTaskIds before processing the queue
- [ ] #2 Automated QA state accurately reflects active review ownership after restart scenarios
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementing stale active-state reconciliation so a newly acquired automated QA worker lock resets orphaned activeTaskIds before queue drain begins.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Fresh automated QA workers now clear stale activeTaskIds before draining the queue, then resweep current trigger-status tasks from disk. This keeps /api/automated-qa aligned with reality after worker crashes or browser restarts instead of leaving orphaned active review entries behind. Validation: bun test src/test/automated-qa.test.ts; bunx tsc --noEmit; bunx biome check src/core/automated-qa.ts src/cli.ts src/test/automated-qa.test.ts.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
