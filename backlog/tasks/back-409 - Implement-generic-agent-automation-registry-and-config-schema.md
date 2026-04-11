---
id: BACK-409
title: Implement generic agent automation registry and config schema
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
Replace the single-purpose automatedQa configuration with a generalized agent automation registry that can support multiple automations, each with its own trigger, agent definition, pause state, queue behavior, and prompt template.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Backlog configuration supports multiple named agent automations rather than a single automatedQa block
- [ ] #2 Settings and server endpoints can load and persist the generalized automation schema
- [ ] #3 Existing automatedQa projects have a documented compatibility or migration path
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Starting implementation of the generic agent automation config schema and automatedQa compatibility path.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented a first-class agentAutomations config schema with legacy automatedQa compatibility in src/types/index.ts and src/file-system/operations.ts, normalized agent automations in src/core/automated-qa.ts, persisted them through /api/config and /api/automated-qa in src/server/index.ts, and kept the Settings page load/save flow in sync in src/web/components/Settings.tsx. Added API coverage in src/test/server-config-endpoint.test.ts. Validation: bunx tsc --noEmit, bun run check ., bun test src/test/automated-qa.test.ts, bun test src/test/server-config-endpoint.test.ts.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
