---
id: BACK-420
title: Tighten automated QA reviewer prompt to avoid subagent-spawn detours
status: Done
assignee:
  - Codex
created_date: '2026-04-03 23:30'
updated_date: '2026-04-03 23:37'
labels:
  - bug
  - automation
  - infra
  - p1
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Captured automated QA output now shows the nested reviewer spends significant time rediscovering qa_engineer config and trying to figure out how to spawn a subagent. The automated QA prompt should steer directly into shell-only backlog verification and decision output, not exploratory repo spelunking about subagent launch mechanics.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Remove or simplify nested subagent-spawn instructions for automated QA reviewer runs.
- [ ] #2 Bias the prompt toward immediate backlog read, evidence check, and final status decision.
- [ ] #3 Verify that a fresh automated QA run reaches a backlog mutation or failure conclusion faster than the current exploratory behavior.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Starting prompt-tightening pass. Goal is to remove nested subagent-spawn detours and bias automated QA directly toward shell-only backlog verification and a status decision.

Live CF2 smoke is clean. TASK-8 used the tightened prompt, read the backlog task directly, kept @QA ownership, and moved itself to Done without subagent-spawn exploration.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Tightened the automated QA reviewer prompt so nested Codex runs stop rediscovering qa_engineer configuration and subagent mechanics. The prompt now explicitly says to perform the review directly, not spawn another reviewer, avoid inspecting Backlog.md source or .codex internals unless required, and reach a status decision as soon as evidence is sufficient. Validation: `bun test src/test/automated-qa.test.ts`, `bunx tsc --noEmit`, `bun run check src/core/automated-qa.ts src/test/automated-qa.test.ts`, plus a live CF2 smoke via TASK-8 that went from QA to Done with captured output showing direct backlog read, QA ownership verification, and verdict execution without subagent-spawn detours.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
