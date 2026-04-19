---
id: BACK-450
title: Rename CLI helper docs for clearer intent
status: Done
assignee:
  - '@codex'
created_date: '2026-04-19 19:24'
updated_date: '2026-04-19 19:27'
labels:
  - docs
  - cli
dependencies: []
documentation:
  - CLI-REFERENCE.md
  - CLI-CHEATSHEET.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rename the two top-level CLI documentation files so their filenames match their actual roles, then update repo references and mirrored helper copies to follow the new names without breaking agent guidance or README links.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Rename the authoritative reference and quick helper files to clearer names that match their actual roles.
2. Update README, agent guidance, repo instructions, and task/document references so links continue to resolve after the rename.
3. Re-sync the canonical helper file to the Bevy mirror copies under the new name and verify parity.
4. Run doc-safe verification, then stage, commit, and push the intended Backlog.md changes.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Renamed the top-level helper docs to CLI-REFERENCE.md and CLI-CHEATSHEET.md, updated all live Backlog.md repo references, and kept the current documentation split explicit in the renamed files.

Verification for the accumulated CLI/report/runtime worktree is green: bunx tsc --noEmit; bun run check .; bun test src/test/acceptance-criteria.test.ts src/test/cli-auto-plain-non-tty.test.ts src/test/cli-milestones.test.ts src/test/task-edit-preservation.test.ts src/test/cli-json-output.test.ts src/test/cli-validate.test.ts src/test/cli-bulk.test.ts src/test/cli-wrapper.test.ts src/test/cli-summary-parent.test.ts src/test/cli-governance-report.test.ts src/test/server-governance-endpoint.test.ts src/test/server-version-endpoint.test.ts src/test/web-governance-page.test.tsx src/web/utils/version.test.ts.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Renamed the two top-level CLI docs to match their real roles: CLI-REFERENCE.md is now the authoritative manual, and CLI-CHEATSHEET.md is the concise quick-reference. Updated README, repo instructions, and agent guidance to follow the new names while preserving the source-of-truth split. This publish step also includes the validated report-driven CLI/browser/runtime improvements already pending in the Backlog.md worktree. Verification: bunx tsc --noEmit; bun run check .; bun test src/test/acceptance-criteria.test.ts src/test/cli-auto-plain-non-tty.test.ts src/test/cli-milestones.test.ts src/test/task-edit-preservation.test.ts src/test/cli-json-output.test.ts src/test/cli-validate.test.ts src/test/cli-bulk.test.ts src/test/cli-wrapper.test.ts src/test/cli-summary-parent.test.ts src/test/cli-governance-report.test.ts src/test/server-governance-endpoint.test.ts src/test/server-version-endpoint.test.ts src/test/web-governance-page.test.tsx src/web/utils/version.test.ts.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
