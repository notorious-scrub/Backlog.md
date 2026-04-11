---
id: doc-3
title: Generalized Agent Automation Model
type: specification
created_date: '2026-04-04 04:39'
---

# Generalized Agent Automation Model

Backlog.md is moving from one hard-coded `automatedQa` workflow to a named
agent automation registry that can drive multiple queue-backed reviewer and
operator automations.

## Model

`agent_automations` is an array of named automation definitions in
`backlog/config.yml`. Each automation owns:

- `id` and `name` for run ledger attribution and dashboard grouping
- `enabled` / `paused` flags for cost control and staged rollout
- `trigger` rules that decide when a task should be queued
- `codexCommand`, `agentName`, `reviewerAssignee`, `timeoutSeconds`, and
  `promptTemplate` for reviewer execution boundaries
- `maxConcurrentRuns` as the per-automation queue concurrency cap

`automated_qa` remains a compatibility alias. Legacy projects can keep that
block; Backlog.md normalizes it into one `agent_automations` entry with ID
`automated-qa` and writes both fields back when saving config.

## Supported Triggers

The first implementation supports two trigger families:

- `status_transition`: queue when a task moves into `toStatus`, optionally
  constrained by `fromStatus`, `labelsAny`, and `assigneesAny`
- `label_added`: queue when one of `addedLabelsAny` is newly applied, optionally
  constrained by the task's current `toStatus` and `assigneesAny`

`labelsAny` and `assigneesAny` act as filters on the post-update task snapshot.
`addedLabelsAny` is evaluated against the transition delta only.

## Loop and Dedupe Guardrails

The queue key is a logical event signature:

`<automationId>::<taskId>::<triggerType>::<triggerSignature>`

That key is stored in `backlog/automated-qa-state.json` and copied into
`backlog/automated-qa-runs.json`. A task update is ignored when the same key is
already queued or active. This prevents duplicate queue inserts and avoids
self-trigger loops from implementation-note or assignee updates that do not
change the trigger condition.

Reviewer prompts always keep non-negotiable guardrails outside
`promptTemplate`: use shell-only backlog commands, do not edit files directly,
do not spawn nested Codex workers, and return a terminal backlog verdict.

## Run Ledger and Queue Semantics

Every queued run emits a durable run record with:

- task ID
- automation ID/name
- trigger type, trigger status, and trigger signature
- queued/start/completion timestamps
- current phase, heartbeat, reviewer PIDs, command, excerpts, exit code, final
  task status, and final outcome

The worker drains queued runs in FIFO order while honoring each automation's
`maxConcurrentRuns`. Failed policy or quota guardrails clear the queue entry and
pause that automation fail-closed.

## Migration from `automatedQa`

1. Existing `automated_qa` config continues to work unchanged.
2. To migrate, copy the legacy values into one `agent_automations` entry:

```yaml
agent_automations: [{"id":"automated-qa","name":"Automated QA","enabled":true,"paused":false,"trigger":{"type":"status_transition","toStatus":"QA"},"codexCommand":"codex","agentName":"qa_engineer","reviewerAssignee":"QA","timeoutSeconds":420,"maxConcurrentRuns":1}]
automated_qa: {"enabled":true,"paused":false,"triggerStatus":"QA","codexCommand":"codex","agentName":"qa_engineer","reviewerAssignee":"QA","timeoutSeconds":420}
```

3. Use additional entries for label-driven or specialist automations.
4. Keep `promptTemplate` concise and task-focused; guardrails and task snapshots
   are appended by the runtime.
