---
id: BACK-413
title: Prove automated QA run lifecycle with durable start and completion evidence
status: Done
assignee: []
created_date: '2026-04-03 21:40'
updated_date: '2026-04-03 21:50'
labels:
  - bug
  - automation
  - observability
  - p0
milestone: m-8
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The current automated QA feature can make tasks look active in QA without giving operators a durable record of whether a worker really launched, whether codex exec started, or how the run ended. Add explicit lifecycle evidence so users can verify that a QA subagent is actually working a task and eventually moved it to Done or back to In Progress.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Automated QA writes durable start and completion evidence that is visible through the API and UI
- [ ] #2 Operators can tell whether a task is actively being reviewed, queued, failed, or abandoned
- [ ] #3 The evidence model is sufficient to explain why a task in QA has or has not progressed
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Investigating the missing durable evidence for automated QA runs and the apparent stuck QA state in CF2. Tracing runner launch, completion handling, and visible state so operators can prove whether a QA review actually fired and how it ended.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a durable automated QA run ledger stored in backlog/automated-qa-runs.json, exposed recent run history through /api/automated-qa and the Settings UI, and recorded queued, started, succeeded, failed, skipped, and abandoned lifecycle states. Active runs now capture worker ownership, attempted Codex process launch details when available, and final task outcome so operators can see more than raw activeTaskIds. Validation: bun test src/test/automated-qa.test.ts src/test/server-config-endpoint.test.ts src/test/status-callback.test.ts; bunx tsc --noEmit; bunx biome check src/core/automated-qa.ts src/server/index.ts src/web/lib/api.ts src/web/components/Settings.tsx src/test/automated-qa.test.ts src/test/server-config-endpoint.test.ts src/utils/status-callback.ts README.md ADVANCED-CONFIG.md.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
