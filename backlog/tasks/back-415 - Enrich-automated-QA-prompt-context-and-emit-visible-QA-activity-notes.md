---
id: BACK-415
title: Enrich automated QA prompt context and emit visible QA activity notes
status: Done
assignee:
  - Codex
created_date: '2026-04-03 22:02'
updated_date: '2026-04-03 22:09'
labels:
  - feature
  - backend
  - automation
  - test
  - p1
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Improve automated QA handoff by passing a compact backlog task snapshot to the spawned Codex review process and emitting operator-visible QA progress notes so active review is observable from both the task and /api/automated-qa.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Automated QA prompt includes a compact task snapshot with title, description, acceptance criteria, DoD, notes/final summary, labels, and refs when available
- [ ] #2 Automated QA appends visible task notes when QA review starts and when it completes or fails
- [ ] #3 Tests cover prompt enrichment and QA activity note behavior
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Starting implementation. Enriching automated QA prompt context and adding task-visible QA activity notes so spawned reviewer work is observable from the task itself, not only from /api/automated-qa.

Validated the new QA visibility flow against the live CF2 backlog. After restarting the stale worker and running a fresh qa-worker cycle, TASK-6 now records task-visible QA start and process-launch notes while TASK-5 was correctly marked abandoned and re-queued.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Enriched src/core/automated-qa.ts so the spawned Codex reviewer receives a compact task snapshot (title, description, AC, DoD, notes, final summary, labels, refs, docs). Added task-visible QA activity notes for review start, reviewer process launch, and completion/failure. Updated src/test/automated-qa.test.ts to cover the richer prompt and visible QA notes. Validation: bun test src/test/automated-qa.test.ts, bunx tsc --noEmit, bunx biome check src/core/automated-qa.ts src/test/automated-qa.test.ts, plus live CF2 queue smoke showing TASK-6 note updates.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
