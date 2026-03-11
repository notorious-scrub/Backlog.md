---
id: BACK-398
title: Centralize record ID allocation for create flows
status: Done
assignee:
  - '@codex'
created_date: '2026-03-11 19:10'
updated_date: '2026-03-11 19:35'
labels:
  - bug
  - refactor
dependencies: []
priority: high
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Creation-time IDs are still allocated in multiple places: tasks use Core, but milestones still generate IDs in FileSystem and documents/decisions still have CLI-owned next-ID helpers. This split leaves callers and agents exposed to numbering mistakes and duplicate-file corruption. Consolidate create flows so CLI/API/MCP callers provide content only and the application allocates the canonical next ID internally for each record type.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Task creation across CLI, API, and MCP continues to allocate IDs internally without caller-supplied numbering.
- [x] #2 Document, decision, and milestone creation no longer depend on CLI- or filesystem-owned next-ID logic; a single core-owned allocation path is used for each create flow.
- [x] #3 Regression tests cover sequential creation for tasks, documents, decisions, and milestones and catch duplicate-ID regressions in create flows.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Trace all create flows and identify every path that currently allocates IDs outside Core.`n2. Add or reuse core-owned create helpers so each record type assigns the next canonical ID internally.`n3. Remove duplicated create-time ID generation from CLI/API wrappers and route them through the core helpers.`n4. Add regression coverage for sequential record creation and duplicate-ID prevention, then run targeted validation plus typecheck/lint.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented core-owned record creation allocation for task, document, decision, and milestone create flows. Non-wizard CLI task/draft creation now delegates to core.createTaskFromInput instead of precomputing IDs in cli.ts. Document/decision creation now uses core helpers directly, and milestone create paths in server/MCP route through Core.createMilestone. Added CLI regression coverage for task creation after completed tasks; verified with bun test src/test/cli-incrementing-ids.test.ts, bun test src/test/mcp-milestones.test.ts, bun test src/test/server-search-endpoint.test.ts, bunx tsc --noEmit.

Repo-wide bun run check . still fails with widespread pre-existing Biome formatting diagnostics outside the touched files, so DoD #2 remains open.

Follow-up hardening moved draft promotion and task demotion ID allocation into Core so lifecycle transitions no longer depend on filesystem-owned numbering. Removed the web/API next-task-id preallocation path used by Quick Task screenshot uploads, which eliminates another caller-managed ID leak. Added regression coverage for promoting a draft after completed tasks already exist. Revalidated with bun test src/test/cli-incrementing-ids.test.ts, bun test src/test/core.test.ts, bun test src/test/filesystem.test.ts, and bunx tsc --noEmit.

Resolved the remaining bun run check . blocker with a repo-wide Biome formatter sweep (bunx @biomejs/biome format . --write). bun run check . now passes. A combined multi-file bun test invocation hit one transient Windows EBUSY temp-directory cleanup failure in mcp-milestones; rerunning src/test/mcp-milestones.test.ts in isolation passed cleanly.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Centralized create-time ID allocation so callers no longer manage numbering for task, document, decision, or milestone creation. The core layer now owns document/decision/milestone ID selection, CLI task creation uses createTaskFromInput for the non-wizard path, and server/MCP milestone creation no longer allocates IDs in filesystem/UI wrappers. Added regression coverage for continued task numbering after completion and revalidated milestone/server create flows.

A second hardening pass moved promote/demote transition numbering into Core and removed the Quick Task UI's dependency on a next-task-id API route for screenshot naming, further reducing caller-managed record sequencing.

Resolved the remaining Biome formatting drift so bun run check . passes and back-398 can be moved to Done. Validation is green with typecheck plus the back-398 regression suites, with only a transient Windows EBUSY cleanup flake observed during one combined Bun invocation.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
