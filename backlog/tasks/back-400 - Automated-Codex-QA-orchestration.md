---
id: BACK-400
title: Automated Codex QA orchestration
status: Done
assignee:
  - '@codex'
created_date: '2026-04-03 20:50'
updated_date: '2026-04-03 21:05'
labels:
  - feature
  - automation
  - web
milestone: m-7
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add first-class project support for automatic Codex-based QA review handoff when tasks move into a configured QA status. This should cover trigger detection, pause/resume behavior, queueing, lock handling, settings, and documentation.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A project can enable automated QA handoff with a configurable trigger status and queue behavior.
- [ ] #2 When automation is paused, tasks moving into the trigger status are queued instead of spawning Codex immediately.
- [ ] #3 When automation is resumed, queued QA tasks are processed without duplicate launches.
- [ ] #4 Settings and documentation make the feature understandable and controllable.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented first-class automated Codex QA orchestration in Backlog.md. Projects can enable the feature, pause auto-spawning to queue QA work, and resume to drain the queue. The shipped slice includes core orchestration, a detached worker command, settings UI, state visibility, tests, and docs. Validation: bun test src/test/automated-qa.test.ts src/test/server-config-endpoint.test.ts; bunx tsc --noEmit.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
