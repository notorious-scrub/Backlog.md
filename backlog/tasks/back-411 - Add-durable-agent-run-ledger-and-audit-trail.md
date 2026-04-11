---
id: BACK-411
title: Add durable agent run ledger and audit trail
status: Done
assignee:
  - Codex
created_date: '2026-04-03 21:40'
updated_date: '2026-04-04 05:08'
labels:
  - feature
  - automation
  - observability
  - p1
milestone: m-8
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Introduce a durable run log for agent automations so operators can see when a run started, which automation triggered it, which task it targeted, which agent or subagent was requested, whether it succeeded, and what final status transition happened. This should become the source of truth for proving that an agent is actually working a task.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Each agent automation run produces a durable record with task id, trigger, start time, completion time, and outcome
- [ ] #2 Operators can distinguish queued, active, succeeded, failed, and abandoned runs without relying only on in-memory state
- [ ] #3 The ledger is sufficient to prove whether a QA run actually started and how it finished
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Starting durable run-ledger and audit-trail enhancements for agent automations.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Expanded the durable automation run ledger and queue state in src/core/automated-qa.ts and src/types/index.ts with queueEntryId, automationId, automationName, triggerType, triggerSignature, queuedRuns, and activeRuns while preserving legacy queuedTaskIds/activeTaskIds compatibility. Recent run records now prove which automation triggered each task and how the run advanced. Added run-ledger assertions in src/test/automated-qa.test.ts. Validation: bunx tsc --noEmit, bun run check ., bun test src/test/automated-qa.test.ts, bun test src/test/server-config-endpoint.test.ts.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
