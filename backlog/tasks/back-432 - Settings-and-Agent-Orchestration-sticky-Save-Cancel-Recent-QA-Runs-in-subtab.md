---
id: BACK-432
title: >-
  Settings and Agent Orchestration - sticky Save/Cancel; Recent QA Runs in
  subtab
status: To Do
assignee: []
created_date: '2026-04-05 20:36'
labels:
  - frontend
  - feature
  - backlog-app
  - p2
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog web UI: (1) On Settings and on the Agent Orchestration page (e.g. /agent-orchestration), make Save Settings and Cancel controls sticky/floating so they remain visible without scrolling to the bottom of long forms. (2) On Agent Orchestration, move Recent QA Runs into its own sub-tab; keep orchestration settings, agent automations, and queue state on the primary tab so the QA run log is not always visible or eagerly loaded (it will grow large).
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Save/Cancel (or equivalent primary actions) remain reachable while scrolling on Settings pages that need it
- [ ] #2 Agent Orchestration primary tab focuses config/automation/queue; Recent QA Runs lives under a separate sub-tab with on-demand or lazy load
- [ ] #3 No functional regression for saving orchestration or settings payloads
<!-- AC:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
