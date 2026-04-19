---
id: BACK-441
title: Add structured JSON output contracts for core CLI read and write commands
status: Done
assignee:
  - '@codex'
created_date: '2026-04-18 23:23'
updated_date: '2026-04-18 23:45'
labels:
  - cli
  - automation
  - enhancement
dependencies: []
documentation:
  - >-
    backlog/docs/doc-014 -
    Backlog-CLI-and-Application-Experience-Pain-Points-Report-2026-04-18.md
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a stable machine-readable --json response contract for core Backlog.md read/write commands so wrappers and agents can chain operations without scraping plain text output. Start with task create/edit/view/list/search, then extend the same contract style to milestone and other relevant record commands.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Core task read/write commands support --json with a stable field contract
- [x] #2 Create and edit responses include ids, path, key metadata, and update timestamps suitable for chaining
- [x] #3 Tests lock the JSON field set so automation consumers can depend on it
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a shared CLI JSON serializer and added --json contracts for task create/edit/view/list plus search, with stable field sets for task, document, and decision results.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added stable machine-readable --json output for core task read/write flows and search, documented the contract, and locked it with CLI integration tests so automation can chain operations without scraping plain text.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
