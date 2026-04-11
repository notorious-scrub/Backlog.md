# Advanced Configuration

For getting started and the interactive wizard overview, see [README.md](README.md#-configuration).

## Configuration Commands

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| View all configs | `backlog config list` |
| Get specific config | `backlog config get defaultEditor` |
| Set config value | `backlog config set defaultEditor "code --wait"` |
| Enable auto-commit | `backlog config set autoCommit true` |
| Bypass git hooks | `backlog config set bypassGitHooks true` |
| Enable cross-branch check | `backlog config set checkActiveBranches true` |
| Set active branch days | `backlog config set activeBranchDays 30` |

Running `backlog config` with no arguments launches the interactive advanced wizard, including guided Definition of Done defaults editing (add/remove/reorder/clear).

## Available Configuration Options

| Key               | Purpose            | Default                       |
|-------------------|--------------------|-------------------------------|
| `defaultAssignee` | Pre-fill assignee  | `[]`                          |
| `defaultStatus`   | First column       | `To Do`                       |
| `definition_of_done` | Default DoD checklist items for new tasks | `(not set)` |
| `statuses`        | Board columns      | `[To Do, In Progress, On Hold, Done]`  |
| `dateFormat`      | Date/time format   | `yyyy-mm-dd hh:mm`            |
| `includeDatetimeInDates` | Add time to new dates | `true`              |
| `defaultEditor`   | Editor for 'E' key | Platform default (nano/notepad) |
| `defaultPort`     | Web UI port        | `6420`                        |
| `autoOpenBrowser` | Open browser automatically | `true`            |
| `remoteOperations`| Enable remote git operations | `true`           |
| `autoCommit`      | Automatically commit task changes | `false`       |
| `bypassGitHooks`  | Skip git hooks when committing (uses --no-verify) | `false`       |
| `zeroPaddedIds`   | Pad all IDs (tasks, docs, etc.) with leading zeros | `(disabled)`  |
| `checkActiveBranches` | Check task states across active branches for accuracy | `true` |
| `activeBranchDays` | How many days a branch is considered active | `30` |
| `onStatusChange`  | Bun shell command to run on status change | `(disabled)` |
| `agentAutomations` | Named queue-backed Codex automations with trigger/filter/prompt settings | `[{ id: "automated-qa", trigger: { type: "status_transition", toStatus: "QA" } }]` |
| `automatedQa` | Built-in Codex QA orchestration settings | `{ enabled: false, paused: false, triggerStatus: "QA", codexCommand: "codex", agentName: "qa_engineer", reviewerAssignee: "QA" }` |

## Detailed Notes

> Editor setup guide: See [Configuring VIM and Neovim as Default Editor](backlog/docs/doc-002%20-%20Configuring-VIM-and-Neovim-as-Default-Editor.md) for configuration tips and troubleshooting interactive editors.

> **Note**: Set `remoteOperations: false` to work offline. This disables git fetch operations and loads tasks from local branches only, useful when working without network connectivity.

> **Git Control**: By default, `autoCommit` is set to `false`, giving you full control over your git history. Task operations will modify files but won't automatically commit changes. Set `autoCommit: true` if you prefer automatic commits for each task operation.

> **Git Hooks**: If you have pre-commit hooks (like conventional commits or linters) that interfere with backlog.md's automated commits, set `bypassGitHooks: true` to skip them using the `--no-verify` flag.

> **Performance**: Cross-branch checking ensures accurate task tracking across all active branches but may impact performance on large repositories. You can disable it by setting `checkActiveBranches: false` for maximum speed, or adjust `activeBranchDays` to control how far back to look for branch activity (lower values = better performance).

> **Status Change Callbacks**: Set `onStatusChange` to run a status-change callback whenever a task's status changes. Available variables: `$TASK_ID`, `$OLD_STATUS`, `$NEW_STATUS`, `$TASK_TITLE`. Per-task override via `onStatusChange` in task frontmatter. On Unix-like systems the command runs through `sh -c`. On Windows, Backlog.md uses a PowerShell-backed runner so the same `$TASK_ID`-style variables work without requiring `sh` on PATH. For cross-platform reliability, prefer simple inline commands and call a script file for complex shell logic.

> **Automated QA Orchestration**: Use `automatedQa` to enable built-in Codex review handoff when tasks move into a status like `QA`. When `paused: true`, matching tasks are queued instead of launching immediately; turning pause back off drains the queue. Existing tasks already sitting in the trigger status are also swept into the queue when the worker runs, so older QA items are not stranded. Active review runs claim the task with `reviewerAssignee` so QA ownership is visible in the backlog. Durable run records are written to `backlog/automated-qa-runs.json` and exposed in the Settings UI so operators can see when a run was queued, started, completed, failed, skipped, or abandoned. Active runs also record a `phase`, `lastHeartbeatAt`, `lastHeartbeatNote`, bounded stdout/stderr excerpts, and the last captured reviewer output event so operators can diagnose timeout failures without retaining unbounded transcripts. Automated QA reviewer prompts are shell-command-only for backlog reads and writes, which avoids nested approval deadlocks from file-edit tools during non-interactive Codex runs. The worker launches Codex with `danger-full-access` sandboxing so the reviewed project can still reach the Backlog.md CLI path outside its own repo tree, and reviewer runs are terminated when they exceed the configured `timeoutSeconds` budget instead of hanging forever. Output excerpts are truncated to the most recent tail of the run log to keep the stored ledger bounded. The browser Settings page exposes the toggle, trigger status, Codex command, reviewer assignee, timeout, queue visibility, and recent run history. Treat a started run as a stale candidate when its heartbeat is older than one minute; at that point verify whether the worker/reviewer PID is still alive before deciding to restart the worker. Example:
>
> `automated_qa: {"enabled":true,"paused":false,"triggerStatus":"QA","codexCommand":"codex","agentName":"qa_engineer","reviewerAssignee":"QA","timeoutSeconds":420}`

> **Generalized Agent Automations**: `agent_automations` is the durable replacement model for multiple named Codex automations. Each entry supports `status_transition` or `label_added` triggers, optional label/assignee filters, `promptTemplate`, `maxConcurrentRuns`, per-automation pause state, and durable queue/run attribution. `automated_qa` remains a compatibility alias and is synchronized with the first automation entry. See `backlog/docs/agent-automation-model.md/doc-3 - Generalized-Agent-Automation-Model.md` for the design and migration model. Example:
>
> `agent_automations: [{"id":"automated-qa","name":"Automated QA","enabled":true,"paused":false,"trigger":{"type":"status_transition","toStatus":"QA","labelsAny":["backend"]},"codexCommand":"codex","agentName":"qa_engineer","reviewerAssignee":"QA","timeoutSeconds":420,"maxConcurrentRuns":1,"promptTemplate":"Verify API contract tests and docs."}]`

> **Date/Time Support**: Backlog.md now supports datetime precision for all dates. New items automatically include time (YYYY-MM-DD HH:mm format in UTC), while existing date-only entries remain unchanged for backward compatibility. Use the migration script `bun src/scripts/migrate-dates.ts` to optionally add time to existing items.
