---
id: BACK-408
title: Design generalized agent automation model
status: Done
assignee:
  - Codex
created_date: '2026-04-03 21:40'
updated_date: '2026-04-04 05:08'
labels:
  - feature
  - automation
  - docs
  - p1
milestone: m-8
dependencies: []
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Define the durable architecture for generalized agent automations in Backlog.md, moving beyond the current automatedQa special case. The design should cover trigger model, filter model, agent definitions, prompt templates, concurrency, queue semantics, pause behavior, cost controls, and migration strategy from automatedQa.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 A design artifact or decision record defines the generic agent automation model and how it supersedes automatedQa
- [ ] #2 The design names supported trigger types, guardrails against loops, and configuration boundaries for prompts and agents
- [ ] #3 Migration guidance from automatedQa to the generalized model is explicit
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Starting the design artifact for the generalized agent automation model and migration path from automatedQa.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Created the generalized agent automation design artifact in backlog/docs/agent-automation-model.md/doc-3 - Generalized-Agent-Automation-Model.md, covering the registry schema, supported trigger/filter model, dedupe and loop guardrails, queue/run ledger semantics, prompt guardrail boundaries, and migration from automated_qa to agent_automations. Validation: bunx tsc --noEmit, bun run check ., bun test src/test/automated-qa.test.ts, bun test src/test/server-config-endpoint.test.ts.
<!-- SECTION:FINAL_SUMMARY:END -->

## Definition of Done
<!-- DOD:BEGIN -->
- [ ] #1 bunx tsc --noEmit passes when TypeScript touched
- [ ] #2 bun run check . passes when formatting/linting touched
- [ ] #3 bun test (or scoped test) passes
<!-- DOD:END -->
