---
id: BACK-449
title: Reduce overlap between CLI reference and helper cheat sheet
status: Done
assignee:
  - '@codex'
created_date: '2026-04-19 19:20'
updated_date: '2026-04-19 19:25'
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
Refactor agent-facing CLI documentation so CLI-INSTRUCTIONS.md is the single source of truth for command semantics and backlog-cli.md stays a concise quick-reference that links back to the authoritative sections instead of duplicating detailed instruction text.
<!-- SECTION:DESCRIPTION:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
1. Reduce backlog-cli.md to a true cheat sheet: quick commands, minimal usage notes, and explicit links back to authoritative sections in CLI-INSTRUCTIONS.md.
2. Keep CLI-INSTRUCTIONS.md as the detailed source of truth for semantics, modeling rules, PowerShell behavior, and governance workflows.
3. Re-sync the canonical backlog-cli.md helper to the mirrored Bevy copies and verify parity.
4. Run doc-safe verification and close the task with the new documentation split recorded.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Reduced backlog-cli.md to a true quick-reference and made CLI-INSTRUCTIONS.md explicitly authoritative for detailed command semantics, modeling rules, governance behavior, and shell-specific instructions.

Re-synced the canonical helper to the Bevy mirror copies and verified matching SHA-256 hashes across all three files.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Removed the main redundancy between CLI-INSTRUCTIONS.md and backlog-cli.md by establishing a clearer documentation split: CLI-INSTRUCTIONS.md is now the authoritative source of truth, while backlog-cli.md is a concise helper that lists common commands and routes behavior questions back to the full reference. Also re-synced the mirrored helper copies and verified parity with matching SHA-256 hashes. Verification: bunx tsc --noEmit; bun run check .; bun test src/test/cli-wrapper.test.ts.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
