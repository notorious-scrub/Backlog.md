---
id: BACK-444
title: Add bulk metadata operations for governance maintenance workflows
status: Done
assignee:
  - '@codex'
created_date: '2026-04-18 23:23'
updated_date: '2026-04-19 01:17'
labels:
  - cli
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
Add bulk update flows for common governance maintenance work such as labels, documentation references, notes, milestone assignment, and status, with support for explicit IDs, filtered task lists, or search results and a preview before apply where practical.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Users can bulk update common metadata fields over explicit ids or filtered result sets
- [x] #2 Bulk operations include preview or confirmation output before mutation for risky changes
- [x] #3 Tests cover representative bulk label, docs, and milestone maintenance flows
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a preview-first 'task bulk' command for explicit IDs, filtered local task sets, and search-query selections. Bulk updates now cover labels, documentation, references, notes, status, milestone, and summary-parent metadata with representative CLI coverage for label, docs, and milestone maintenance flows.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
