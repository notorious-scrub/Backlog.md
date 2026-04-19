---
id: BACK-447
title: Surface runtime identity and diagnostics in browser and API views
status: Done
assignee:
  - '@codex'
created_date: '2026-04-18 23:23'
updated_date: '2026-04-18 23:56'
labels:
  - browser
  - diagnostics
  - enhancement
dependencies: []
documentation:
  - >-
    backlog/docs/doc-014 -
    Backlog-CLI-and-Application-Experience-Pain-Points-Report-2026-04-18.md
priority: low
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Make runtime version, build, and project-source identity obvious in browser and API diagnostics so stale or mismatched runtimes are easier to detect before users spend time debugging the wrong data surface.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Browser UI clearly shows runtime version and source identity for the active project
- [x] #2 API diagnostics expose runtime version and source details in a stable shape
- [x] #3 Stale or incompatible runtime states produce explicit operator warnings when capabilities mismatch
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Expanded /api/version into a stable runtime-diagnostics shape with project root, runtime entry details, and capability flags, and surfaced that metadata plus mismatch warnings in the browser sidebar.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added API and browser runtime diagnostics so operators can see the active version and project source directly, with explicit warnings when the server metadata indicates an older or incompatible runtime.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
