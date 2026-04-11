---
id: BACK-424
title: Add OS-level process-tree enforcement for absolute-path nested Codex launches
status: Done
assignee:
  - '@Codex'
created_date: '2026-04-04 00:50'
updated_date: '2026-04-05 19:46'
labels:
  - bug
  - automation
  - infra
  - p0
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
BACK-423 blocks spawn_agent, disables multi-agent mode, and intercepts PATH-resolved shell codex calls, but a reviewer process could still invoke an absolute codex executable path directly. Add OS/process-level enforcement for automated QA reviewer runs so any descendant Codex process under the reviewer PID is detected, terminated, and classified as a non-requeueing failure, or apply a native Codex CLI deny mechanism that closes this path.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Nested absolute-path Codex launches under automated QA reviewer processes are detected and terminated, or a native Codex CLI deny mechanism is applied and verified.
- [ ] #2 A regression test covers a reviewer process attempting to launch Codex by absolute executable path.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Validated current guard remains relevant: PATH shim and multi-agent disable are in place, but an absolute-path nested Codex child would still bypass the reviewer PATH guard. Implementing descendant-process detection/termination plus regression coverage.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Confirmed BACK-424 was still relevant because PATH shims and multi-agent disable did not cover explicit absolute-path nested Codex descendant launches. Added process-tree enforcement helpers in src/core/automated-qa.ts to scan reviewer descendants and terminate nested Codex launches, and added regression coverage in src/test/automated-qa.test.ts for absolute-path codex descendant detection alongside the existing nested-launch fail-close tests. Validation passed: bun test src/test/automated-qa.test.ts, bunx tsc --noEmit, bun run check .
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
