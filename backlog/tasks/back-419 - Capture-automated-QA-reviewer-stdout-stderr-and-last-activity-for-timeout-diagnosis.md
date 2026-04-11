---
id: BACK-419
title: >-
  Capture automated QA reviewer stdout stderr and last activity for timeout
  diagnosis
status: Done
assignee:
  - Codex
created_date: '2026-04-03 23:18'
updated_date: '2026-04-03 23:30'
labels:
  - bug
  - automation
  - infra
  - p1
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Automated QA currently records queue/start/completion metadata, heartbeat notes, PIDs, and final timeout errors, but it does not persist reviewer stdout/stderr or a transcript excerpt. When a reviewer times out, operators cannot tell what it was doing or where it stalled. Add durable capture of last output/activity so automated QA failures are diagnosable.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Persist reviewer stdout/stderr or a bounded transcript excerpt for automated QA runs.
- [ ] #2 Expose the last captured reviewer activity in the API and Settings UI for timed-out or failed runs.
- [ ] #3 Document retention and truncation behavior so logs do not grow without bound.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Starting implementation. Adding bounded reviewer stdout/stderr capture to automated QA runs, exposing it via the API, and surfacing it in Settings so timeout failures are diagnosable.

Implemented bounded stdout/stderr and last-output capture in automated QA run records, exposed it in Settings, and validated the persistence path in unit tests. Live CF2 verification is still incomplete because the CF2 automated-qa-runs.json ledger was unexpectedly rewritten to [] during the browser/worker restart; keeping this task open until the live run-store behavior is cleanly proven.

Live CF2 verification now works. /api/automated-qa shows active TASK-6 with persisted stdoutExcerpt, lastOutputAt, and lastOutputSource; the ledger no longer collapses to []. Created a follow-up to tighten the automated QA prompt based on the captured reviewer output.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented bounded reviewer stdout/stderr and last-output capture for automated QA runs, exposed it through the /api/automated-qa payload, and surfaced it in the Settings UI. Also fixed the run-ledger race by serializing state/run mutations and using retry-based reads so concurrent heartbeat/output updates no longer collapse the ledger to []. Validation: `bun test src/test/automated-qa.test.ts`, `bunx tsc --noEmit`, `bun run check src/core/automated-qa.ts src/types/index.ts src/test/automated-qa.test.ts src/web/components/Settings.tsx README.md ADVANCED-CONFIG.md`, and live CF2 proof via /api/automated-qa showing TASK-6 with stdoutExcerpt, lastOutputAt, and lastOutputSource while the reviewer is active.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
