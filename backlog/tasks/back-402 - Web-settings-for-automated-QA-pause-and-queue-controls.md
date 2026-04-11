---
id: BACK-402
title: Web settings for automated QA pause and queue controls
status: Done
assignee:
  - '@codex'
created_date: '2026-04-03 20:50'
updated_date: '2026-04-03 21:05'
labels:
  - feature
  - automation
  - web
milestone: m-7
dependencies:
  - BACK-400
priority: medium
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Expose automated QA controls in the settings UI so users can enable or pause QA auto-spawning, inspect queued work, and understand what will happen when automation resumes.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Settings UI exposes enable/pause state and trigger status clearly.
- [ ] #2 Users can see queued QA tasks when automation is paused.
- [ ] #3 Resuming automation drains queued tasks or clearly reports failures.
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added Automated QA controls to the Settings page, including enable/pause toggles, trigger-status selection, Codex command/subagent fields, and queued/active task visibility backed by a new `/api/automated-qa` endpoint. Validation: bun test src/test/server-config-endpoint.test.ts; bunx tsc --noEmit.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
