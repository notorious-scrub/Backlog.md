---
id: BACK-433
title: Add generic backlog CLI helper doc for task and milestone workflows
status: Done
assignee:
  - '@Codex'
created_date: '2026-04-05 21:20'
updated_date: '2026-04-05 21:22'
labels:
  - docs
  - chore
  - cli
  - p2
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Create a concise, generic helper document that agents can use in any Backlog.md project to quickly manage tasks and milestones with the CLI. The doc should focus on common create/list/view/edit/archive flows, generic examples, plain-output guidance for automation, and clear notes where milestone operations still require the browser UI or browser API instead of the CLI.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Add a generic helper markdown file with task and milestone command examples that apply to any Backlog.md instance
- [ ] #2 Document the current milestone CLI limitations honestly and include the recommended browser or API fallback where needed
- [ ] #3 Link the helper from a discoverable top-level doc so agents can find it quickly
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Starting work on a generic backlog-cli.md helper focused on fast task and milestone management for any Backlog.md instance. Verified current CLI help so examples stay aligned with the real command surface, including milestone list/archive-only support in the CLI today.

Added a new top-level backlog-cli.md helper focused on common agent task and milestone workflows. The helper keeps examples generic across Backlog.md instances, emphasizes --plain for automation, and documents that milestone create/edit currently flow through backlog browser or its /api/milestones endpoints rather than the CLI. Updated README discoverability links to point agents at the helper.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added backlog-cli.md as a concise, generic task-and-milestone CLI helper for any Backlog.md project and linked it from README.md for quick discovery. The helper covers create/list/view/edit/archive task flows, AC/DoD/final-summary updates, milestone list/archive commands, and browser/API fallback examples for milestone creation. Validation: bun run check README.md backlog-cli.md; bun test src/test/docs-recursive.test.ts.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
