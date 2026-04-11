---
id: BACK-431
title: 'Support hierarchical subtask IDs (e.g. BACK-123.1, BACK-123.2)'
status: Done
assignee:
  - '@Codex'
created_date: '2026-04-05 19:30'
updated_date: '2026-04-05 20:05'
labels:
  - feature
  - backend
  - frontend
  - cli
  - p1
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add first-class support for dotted subtask numbering under a parent work item, e.g. parent BACK-123 with children BACK-123.1, BACK-123.2. Today Backlog.md does not support this ID shape; teams often use separate tasks plus dependencies instead. Deliver: ID allocation rules, file naming under backlog/tasks, CLI (create/edit/list/view/archive), web UI, search, API routes, migrations or import path for existing projects, and documentation. Resolve interaction with dependency links, zero-padded IDs, task_prefix, and any validators that reject dots.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Users can create and reference subtasks with stable parent.child IDs (exact format spec documented)
- [ ] #2 CLI and browser support list, edit, and filter parent/child relationships for dotted IDs
- [ ] #3 Existing projects without dotted IDs behave unchanged; edge cases (rename parent, max depth) defined
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Verified this task was based on a stale assumption and required no new implementation. Backlog.md already supports dotted subtask IDs and parent-child hierarchies through parent-aware ID allocation in src/core/backlog.ts, hierarchical parsing/generation in src/utils/prefix-config.ts, CLI create/filter flows in src/cli.ts, and nested rendering/filtering paths already exercised by existing regressions. Validation passed: bun test src/test/cli-parent-shorthand.test.ts src/test/id-generation.test.ts.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
