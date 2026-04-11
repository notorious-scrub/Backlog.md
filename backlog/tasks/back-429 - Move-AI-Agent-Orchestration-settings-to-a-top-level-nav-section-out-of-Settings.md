---
id: BACK-429
title: >-
  Move AI Agent Orchestration settings to a top-level nav section (out of
  Settings)
status: Done
assignee:
  - '@Codex'
created_date: '2026-04-05 19:02'
updated_date: '2026-04-05 20:05'
labels:
  - frontend
  - feature
  - backlog-app
  - p2
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Backlog web app: relocate AI Agent Orchestration configuration from the Settings area into its own primary section in the main navigation/shell so it is discoverable and not buried under generic settings. Update routes, sidebar labels, and any deep links; ensure permissions and save flows unchanged; add regression checks for settings persistence.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 AI Agent Orchestration is reachable from a dedicated main section, not only under Settings
- [ ] #2 Old Settings entry removed or redirects to the new location without breaking bookmarks where feasible
- [ ] #3 Smoke test: configure orchestration, reload app, values persist
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Starting UI move for AI Agent Orchestration out of Settings into a top-level nav section. Inspecting current route graph, side navigation, settings component, and existing web tests before editing.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Moved AI Agent Orchestration out of Settings into its own top-level /agent-orchestration route, added redirects from legacy settings deep links, and added primary sidebar navigation entries in both expanded and collapsed modes. Extracted the orchestration UI into src/web/components/AgentOrchestrationSettingsSection.tsx, kept config persistence centralized via Settings mode switching, and added focused UI regression coverage in src/test/web-agent-orchestration.test.tsx for navigation visibility, Settings removal, and persistence after reload. Validation passed: bun test src/test/web-agent-orchestration.test.tsx, bunx tsc --noEmit, bun run check .
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
