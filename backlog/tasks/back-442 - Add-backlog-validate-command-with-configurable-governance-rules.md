---
id: BACK-442
title: Add backlog validate command with configurable governance rules
status: Done
assignee:
  - '@codex'
created_date: '2026-04-18 23:23'
updated_date: '2026-04-18 23:51'
labels:
  - governance
  - cli
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
Add a first-class backlog validate or backlog lint flow for governance hygiene so repos can detect metadata drift without ad hoc scripts. Support built-in rules such as required metadata, broken dependencies, invalid labels, malformed milestones, and missing documentation links, plus project-configurable rules in repo config.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Backlog exposes a validate or lint command for common backlog hygiene checks
- [x] #2 Projects can configure additional required-field or governance rules in repo config
- [x] #3 Validation output is available in both human-readable and JSON forms
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Added backlog validate/backlog lint with built-in checks for configured required task fields, broken dependencies, invalid labels, and invalid milestone IDs, plus structured JSON output for automation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented a first-pass governance validator with human and JSON output, repo-configurable required task fields in config, and focused CLI tests covering failing and clean projects.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
