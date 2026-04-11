---
id: BACK-417
title: Add QA heartbeat and last-known-phase visibility for active agent runs
status: Done
assignee:
  - Codex
created_date: '2026-04-03 22:18'
updated_date: '2026-04-03 22:27'
labels:
  - feature
  - backend
  - automation
  - docs
  - p1
milestone: m-8
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Improve automated QA observability by recording lightweight heartbeat and last-known-phase data for active reviewer runs so operators can distinguish healthy long-running reviews from stale or hung launches. The current system shows queued/started state plus PIDs, but it does not show whether the reviewer is still making progress, waiting on a tool, or effectively stalled.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Define a lightweight heartbeat or phase-tracking model for active agent runs
- [ ] #2 Expose last-known activity or phase in the API/UI so active QA tasks are easier to distinguish from stale runs
- [ ] #3 Clarify operator behavior for stale-run detection and recovery when heartbeat data stops updating
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Starting implementation. Adding heartbeat and last-known-phase tracking to automated QA runs so active reviewer processes are easier to distinguish from stale or hung runs in the API and settings UI.

Validated live against the CF2 backlog after restarting the browser and launching a fresh source-based qa-worker. /api/automated-qa now exposes staleThresholdMs plus per-run phase, lastHeartbeatAt, and lastHeartbeatNote. The active TASK-5 run advanced its heartbeat from 22:26:26Z to 22:26:41Z, proving live progress instead of a frozen started state. TASK-5 task notes also now use local time with offset (for example 2026-04-03 15:26:26.309 -07:00).
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Extended automated QA run records with phase and heartbeat metadata in src/core/automated-qa.ts and surfaced the stale-threshold contract through src/server/index.ts and src/web/lib/api.ts. Updated src/web/components/Settings.tsx to show phase, last heartbeat time, last heartbeat note, and a stale-heartbeat warning for long-running runs. Documented operator guidance in README.md and ADVANCED-CONFIG.md. Validation: bun test src/test/automated-qa.test.ts, bunx tsc --noEmit, bunx biome check src/core/automated-qa.ts src/server/index.ts src/web/lib/api.ts src/web/components/Settings.tsx src/test/automated-qa.test.ts README.md ADVANCED-CONFIG.md, plus live CF2 smoke on http://localhost:6430/api/automated-qa proving heartbeat movement.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
