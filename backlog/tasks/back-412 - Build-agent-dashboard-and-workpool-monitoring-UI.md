---
id: BACK-412
title: Build agent dashboard and workpool monitoring UI
status: Done
assignee:
  - Codex
created_date: '2026-04-03 21:40'
updated_date: '2026-04-04 05:08'
labels:
  - feature
  - automation
  - web
  - p1
milestone: m-8
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create an operator-facing dashboard for agent automations that shows active agents, queued runs, recent completions and failures, current task ownership, automation-level toggles, and useful troubleshooting context such as last error and run duration.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 The UI shows active and queued agent work across automations
- [ ] #2 Operators can see which task each active run is targeting and which automation triggered it
- [ ] #3 The dashboard exposes enough runtime state to troubleshoot stuck or failed agent work without reading raw state files
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Starting the operator-facing agent automation dashboard and workpool monitoring UI.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Built an operator-facing agent automation dashboard inside the Settings page: each configured automation is listed with enable/pause state, trigger summary, command, agent, assignee, timeout, max concurrency, and prompt template; queue and active badges now show task + automation + trigger type; recent run cards show automation ID/name, trigger metadata, queue entry ID, heartbeat/output details, and stale-run warnings. Updated API typing in src/web/lib/api.ts. Validation: bunx tsc --noEmit, bun run check ., bun test src/test/automated-qa.test.ts, bun test src/test/server-config-endpoint.test.ts.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
