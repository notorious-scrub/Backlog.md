---
id: BACK-443
title: Model summary-parent relationships separately from blockers
status: Done
assignee:
  - '@codex'
created_date: '2026-04-18 23:23'
updated_date: '2026-04-19 00:29'
labels:
  - data-model
  - planning
  - enhancement
dependencies: []
documentation:
  - >-
    backlog/docs/doc-014 -
    Backlog-CLI-and-Application-Experience-Pain-Points-Report-2026-04-18.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a first-class parent or summary relationship model that is distinct from blocker dependencies so milestone parents, wave summaries, and contract summary items do not need to be represented as blocked-by chains or note conventions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Tasks can belong to a summary parent without being blocked by it
- [x] #2 Hierarchy is exposed consistently in CLI, browser, API, and persistence
- [x] #3 Milestone or wave summary tasks can be queried from modeled relationships instead of inferred notes
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a first-class summary-parent relationship distinct from dotted subtasks and blocker dependencies across persistence, CLI, API, plain/json output, and the browser task editor. Added end-to-end coverage for create/edit/view/list and server/browser hierarchy presentation.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
