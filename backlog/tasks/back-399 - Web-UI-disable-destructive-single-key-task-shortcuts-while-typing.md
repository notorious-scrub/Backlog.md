---
id: BACK-399
title: 'Web UI: disable destructive single-key task shortcuts while typing'
status: Done
assignee:
  - Codex
created_date: '2026-03-11 22:56'
updated_date: '2026-03-11 22:59'
labels:
  - bug
  - frontend
  - p1
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The task details modal currently binds bare keyboard shortcuts like E and C at window scope. In practice, users typing in the app can accidentally trigger edit or complete/close flows, which interrupts normal text entry. Remove or hard-disable these destructive single-key shortcuts in the web UI so typing letters does not change task state or modal mode unexpectedly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Typing letter keys in the web app does not trigger task edit/complete actions
- [x] #2 TaskDetailsModal no longer completes Done tasks from a bare 'c' keypress
- [x] #3 Regression coverage verifies the modal ignores these single-key shortcuts
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Investigating global keydown handling in TaskDetailsModal. Current behavior binds bare e/c in preview mode at window scope, which matches the reported accidental task completion while typing.

Removed bare preview-mode key handlers for 'e' and 'c' from TaskDetailsModal so typing those letters no longer flips the modal into edit mode or completes Done tasks. Kept Escape-to-cancel-edit and Ctrl/Cmd+S save behavior intact. Added DOM-level regression coverage in src/test/web-task-details-modal-shortcuts.test.tsx for both ignored bare-key paths.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Disabled destructive single-key web modal shortcuts that were interrupting typing. TaskDetailsModal no longer reacts to bare 'e' or bare 'c' in preview mode, while existing intentional shortcuts (Escape in edit mode and Ctrl/Cmd+S) remain. Verified with bunx tsc --noEmit, bun run check ., and bun test src/test/web-task-details-modal-shortcuts.test.tsx. Note: a broader run including src/test/web-task-details-modal-final-summary.test.tsx still shows unrelated existing expectation failures around collapsed Final Summary content, which were not changed by this fix.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [x] #1 bunx tsc --noEmit passes when TypeScript touched
- [x] #2 bun run check . passes when formatting/linting touched
- [x] #3 bun test (or scoped test) passes
<!-- DOD:END -->
