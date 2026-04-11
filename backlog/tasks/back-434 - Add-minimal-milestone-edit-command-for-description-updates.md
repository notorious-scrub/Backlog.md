---
id: BACK-434
title: Add minimal milestone edit command for description updates
status: Done
assignee:
  - '@codex'
created_date: '2026-04-11 20:15'
updated_date: '2026-04-11 20:20'
labels:
  - milestones
  - cli
  - enhancement
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a minimal CLI milestone edit command scoped to updating milestone description/content in milestone files without introducing the full task edit surface. Reuse existing milestone alias resolution and file mutation patterns.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 backlog milestone edit <name> supports -d/--description and updates the milestone description in-place
- [x] #2 The command resolves milestones by id, numeric alias, or title using the same rules as existing milestone commands
- [x] #3 Tests cover successful description updates and not-found behavior
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Add a shared milestone description update mutation that preserves id/title and rewrites the Description section only. 2. Wire a minimal CLI milestone edit command with -d/--description onto that mutation and keep error handling consistent with other milestone commands. 3. Add focused CLI tests plus targeted verification, then simplify any unnecessary branching.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented a minimal milestone description edit flow by adding a filesystem rewrite for the Description section, a shared milestone edit mutation with commit rollback, and a new CLI subcommand: backlog milestone edit <name> -d <text>. Added focused CLI tests covering edit by title/numeric alias and missing milestones. Verification: bun test src/test/cli-milestones.test.ts; bunx tsc --noEmit; bun run check src/cli.ts src/core/milestone-mutations.ts src/file-system/operations.ts src/test/cli-milestones.test.ts src/mcp/tools/tasks/handlers.ts README.md CLI-INSTRUCTIONS.md backlog-cli.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added minimal CLI milestone editing for description updates without introducing a full milestone wizard or generalized edit surface. The command reuses existing milestone alias resolution, updates the milestone Description section in-place, preserves id/title/file naming, and documents the new flow in the CLI docs and helper.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
