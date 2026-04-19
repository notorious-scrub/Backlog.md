---
id: BACK-448
title: Refresh agent-facing CLI guidance for post-report command surface
status: Done
assignee:
  - '@codex'
created_date: '2026-04-19 19:08'
updated_date: '2026-04-19 19:25'
labels:
  - docs
  - cli
  - agents
dependencies: []
documentation:
  - CLI-CHEATSHEET.md
  - CLI-REFERENCE.md
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Update agent-facing Backlog.md documentation so AGENTS.md, CLI-INSTRUCTIONS.md, backlog-cli.md, and related guidance reflect the current CLI syntax, governance workflows, JSON output contracts, bulk operations, summary-parent modeling, validation/reporting commands, and PowerShell/Windows usage patterns.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Audit AGENTS.md, CLI-INSTRUCTIONS.md, backlog-cli.md, and agent-guidelines for stale or incomplete command coverage.
2. Rewrite the agent-facing sections so they explain task edit semantics, JSON/plain output usage, validation/reporting flows, summary-parent vs parent, bulk maintenance, and PowerShell quoting/runtime guidance consistently.
3. Re-sync the canonical helper doc to the mirrored Bevy copies and verify parity with file hashes.
4. Run documentation validation checks and capture a final summary in the task.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Updated AGENTS.md, CLI-INSTRUCTIONS.md, backlog-cli.md, and src/guidelines/agent-guidelines.md so they consistently document --plain vs --json usage, task edit semantics, summary-parent modeling, task bulk preview/apply behavior, governance validation/reporting flows, and PowerShell/Windows wrapper guidance.

Re-synced the canonical backlog-cli.md helper to the Bevy mirror copies and verified identical SHA-256 hashes across all three files.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Refreshed the repo's agent-facing Backlog.md documentation to match the current CLI surface after the report-driven feature work. The updated guidance now explains deterministic task edit semantics, JSON output contracts, validation and governance reports, summary-parent vs dotted parent modeling, preview-first bulk maintenance flows, and tested PowerShell usage patterns. Also re-synced the canonical backlog-cli.md helper to the mirrored Bevy copies and verified parity with matching SHA-256 hashes. Verification: bunx tsc --noEmit; bun run check .; bun test src/test/cli-wrapper.test.ts src/test/cli-bulk.test.ts src/test/cli-validate.test.ts src/test/cli-json-output.test.ts.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
