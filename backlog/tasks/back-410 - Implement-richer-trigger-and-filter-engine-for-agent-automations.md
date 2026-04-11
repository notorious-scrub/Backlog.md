---
id: BACK-410
title: Implement richer trigger and filter engine for agent automations
status: Done
assignee:
  - Codex
created_date: '2026-04-03 21:40'
updated_date: '2026-04-04 05:08'
labels:
  - feature
  - automation
  - cli
  - p1
milestone: m-8
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Extend agent automation triggers beyond a single status match so projects can react to status transitions, label presence or addition, assignee changes, and similar task lifecycle events. Include dedupe, loop prevention, concurrency limits, and queue semantics as part of the implementation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Agent automations can trigger on status transitions and label-based conditions
- [ ] #2 The engine prevents self-trigger loops and duplicate queueing for the same logical event
- [ ] #3 Concurrency and queue behavior are configurable enough for real multi-agent use
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Starting implementation of richer status/label trigger matching, dedupe, and queue semantics for agent automations.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Extended automation triggering beyond one status match in src/core/automated-qa.ts: added status_transition and label_added trigger evaluation, labelsAny/addedLabelsAny/assigneesAny filters, deterministic trigger signatures, dedupe by automation+task across queued/active entries, and per-automation maxConcurrentRuns gating. Core task updates now call handleAutomatedQaTaskChange from src/core/backlog.ts so label additions can trigger automations. Added regression coverage in src/test/automated-qa.test.ts. Validation: bunx tsc --noEmit, bun run check ., bun test src/test/automated-qa.test.ts, bun test src/test/server-config-endpoint.test.ts.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
