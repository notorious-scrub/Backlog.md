---
id: BACK-445
title: Expand governance-oriented search filters and reporting views
status: Done
assignee:
  - '@codex'
created_date: '2026-04-18 23:23'
updated_date: '2026-04-19 00:29'
labels:
  - search
  - governance
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
Improve CLI and browser discovery for governance questions such as open tasks missing docs, tasks with non-canonical labels, or tasks missing modeled summary relationships so operators can answer backlog-health questions without custom scripting.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 CLI search or list flows can filter on metadata completeness and governance-health conditions
- [x] #2 Browser surfaces first-class views or reports for validation and metadata gaps
- [x] #3 Saved or repeatable governance reports can answer common health queries directly
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added governance-oriented task list filters, repeatable 'backlog report governance' reports, a new /api/governance/reports endpoint, and a browser Governance page so operators can answer metadata-health questions without custom scripts. Covered missing documentation, missing summary parent, invalid labels, invalid dependencies, and invalid milestones in CLI/API/browser tests.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
