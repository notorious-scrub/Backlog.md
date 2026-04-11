---
id: BACK-416
title: Add first-class audit log for agent automation activity and status transitions
status: Done
assignee: []
created_date: '2026-04-03 22:16'
updated_date: '2026-04-04 15:39'
labels:
  - feature
  - backend
  - automation
  - docs
  - p1
milestone: m-8
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Formalize an audit-log model for agent orchestration so status transitions and automation activity are stored in a dedicated history surface instead of relying on task implementation notes. The current implementation-note entries remain acceptable as a temporary stopgap, but the long-term design should capture timestamped task status changes, automation start/launch/completion/failure events, agent identity, and related execution metadata in a structured audit location.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Create a backlog design/task for a first-class audit log that records task status transitions with timestamps and actor context
- [ ] #2 Cover agent automation events such as review started, reviewer launched, completion, failure, abandonment, and queue transitions
- [ ] #3 Define how audit-log data should be surfaced in the web UI and API without relying on implementation notes as the primary source
<!-- AC:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Created doc-4 Agent Automation Audit Log Model with a first-class event schema, append-only JSONL storage design, task and automation event taxonomy, loop-guard/write-boundary rules, API/UI exposure plan, and migration steps away from implementation-note-as-log. Created BACK-426, BACK-427, and BACK-428 as dependency-linked implementation slices. Validation: bun run check .; bun test src/test/docs-recursive.test.ts.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
