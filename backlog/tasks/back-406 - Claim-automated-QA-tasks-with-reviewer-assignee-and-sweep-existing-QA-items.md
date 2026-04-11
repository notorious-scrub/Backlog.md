---
id: BACK-406
title: Claim automated QA tasks with reviewer assignee and sweep existing QA items
status: Done
assignee: []
created_date: '2026-04-03 21:26'
updated_date: '2026-04-03 21:29'
labels:
  - feature
  - automation
  - cli
  - p1
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Improve automated QA orchestration so active review runs visibly claim ownership in the task assignee field and so pre-existing tasks already sitting in the trigger status are queued when automated QA starts or resumes. This should make QA activity obvious in the backlog and avoid orphaned QA tasks.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Automated QA assigns active review tasks to a configured reviewer assignee, defaulting to QA
- [ ] #2 When automated QA starts or resumes, existing tasks already in the trigger status are queued for review without requiring a fresh status transition
- [ ] #3 Tests cover reviewer assignment and trigger-status sweep behavior
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementing automated QA ownership claim and startup sweep so QA-active tasks visibly assign to the reviewer and older QA-column tasks are enqueued when automation starts or resumes.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Automated QA now supports a configurable reviewer assignee, defaulting to QA, and claims active review tasks with that assignee. The worker also sweeps existing tasks already sitting in the trigger status when it runs, so older QA items are queued automatically instead of waiting for a fresh status transition. Validation: bun test src/test/automated-qa.test.ts src/test/server-config-endpoint.test.ts src/test/status-callback.test.ts; bunx tsc --noEmit; bunx biome check src/core/automated-qa.ts src/file-system/operations.ts src/types/index.ts src/web/components/Settings.tsx src/test/automated-qa.test.ts src/test/server-config-endpoint.test.ts src/utils/status-callback.ts README.md ADVANCED-CONFIG.md.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
