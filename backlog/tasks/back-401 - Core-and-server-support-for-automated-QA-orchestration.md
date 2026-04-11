---
id: BACK-401
title: Core and server support for automated QA orchestration
status: Done
assignee:
  - '@codex'
created_date: '2026-04-03 20:50'
updated_date: '2026-04-03 21:05'
labels:
  - feature
  - automation
  - backend
milestone: m-7
dependencies:
  - BACK-400
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Implement persisted project configuration, queue/lock state, and server-side orchestration for automatic Codex QA launches when tasks enter the configured QA status.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Project config persists automated QA enablement, pause state, trigger status, and Codex execution settings.
- [ ] #2 A queued QA task is tracked durably enough to survive browser refreshes and repeated updates without duplicate launches.
- [ ] #3 Server-side orchestration can launch Codex for eligible QA tasks and update queue/run state.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Starting core/server implementation for automated QA orchestration. Focus first on persisted config, pause/queue state, and Codex exec launch path.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added built-in automated QA orchestration to the core status-change path. This ships automated QA config parsing/serialization, persistent queue state, a detached `qa-worker` command, server bootstrap/resume triggering, and regression coverage for paused queueing plus successful queue draining. Validation: bun test src/test/automated-qa.test.ts src/test/server-config-endpoint.test.ts; bunx tsc --noEmit. Follow-up recorded separately in BACK-404 for existing Windows `sh` assumptions in generic status callbacks.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
