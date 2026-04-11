---
id: BACK-423
title: Hard-block nested Codex reviewer launches in automated QA
status: Done
assignee:
  - Codex
created_date: '2026-04-04 00:47'
updated_date: '2026-04-04 00:50'
labels:
  - bug
  - automation
  - infra
  - p0
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Prompt-only no-spawn instructions are not a sufficient guardrail. Enforce a runtime-level deny path for automated QA reviewer runs so spawned reviewers cannot launch nested Codex agents/processes. The first implementation passes features.multi_agent=false and prepends a generated codex shim in the reviewer PATH; track and validate this behavior on the Backlog.md board.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Automated QA reviewer launches disable multi-agent delegation and nested shell codex launches through runtime/tooling guardrails, not prompt text alone.
- [ ] #2 Regression tests cover a reviewer process attempting to run a nested codex command and confirm the launch is blocked with a non-zero failure.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementing runtime-level guardrails against nested reviewer delegation: disable multi-agent mode for automated QA Codex runs, prepend a generated PATH shim that blocks shell-launched codex, and preserve prompt-level no-delegation instructions as a secondary guard.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented runtime-level nested reviewer launch guardrails in src/core/automated-qa.ts by passing features.multi_agent=false, prepending a generated codex PATH shim to reviewer environments, and strengthening the reviewer prompt. Added regression coverage in src/test/automated-qa.test.ts for nested shell-launched codex commands. Verified with bun test src/test/automated-qa.test.ts, bunx tsc --noEmit, and bun run check .
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
