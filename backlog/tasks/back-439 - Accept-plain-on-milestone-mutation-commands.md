---
id: BACK-439
title: Accept --plain on milestone mutation commands
status: Done
assignee:
  - '@codex'
created_date: '2026-04-18 22:32'
updated_date: '2026-04-18 22:37'
labels:
  - milestones
  - cli
  - bug
dependencies: []
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Milestone mutation commands are documented and used as agent-friendly flows, but the CLI currently rejects --plain on at least milestone add. Align the milestone mutation command surface with the documented plain-output contract so scripted roadmap and release flows do not fail on unknown option errors.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 backlog milestone add accepts --plain without changing its current success output
- [x] #2 Other milestone mutation commands with plain-text outputs do not reject --plain
- [x] #3 Focused tests cover the accepted flag surface so docs cannot drift silently again
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented --plain acceptance for milestone add/edit/rename/remove/archive, added focused CLI milestone tests, and updated the milestone CLI docs/guidelines. Repo-wide bun run check . is still blocked by unrelated formatter drift in src/completions/data-providers.ts, src/constants/index.ts, src/test/board-config-simple.test.ts, src/test/task-wizard.test.ts, and src/ui/status-icon.ts.

Resolved repo-wide formatter drift in src/completions/data-providers.ts, src/constants/index.ts, src/test/board-config-simple.test.ts, src/test/task-wizard.test.ts, src/test/status-icon.test.ts, and src/ui/status-icon.ts. Verification now passes for bunx tsc --noEmit, bun test src/test/cli-milestones.test.ts, and bun run check .
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented --plain acceptance for milestone add/edit/rename/remove/archive, added focused CLI milestone coverage, updated milestone command docs, and cleared the unrelated Biome formatter drift blocking repo-wide check validation.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
