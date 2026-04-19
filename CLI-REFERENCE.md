# CLI Reference

Authoritative command reference for Backlog.md. For getting started, see [README.md](README.md). For the concise agent cheat sheet, see [CLI-CHEATSHEET.md](CLI-CHEATSHEET.md).

## Agent And PowerShell Quick Start

Use this flow when an agent or script is operating a backlog directly:

1. Run commands from the project root that contains `backlog/`.
2. Search or list first so you do not create duplicates:
   - `backlog task list --plain`
   - `backlog search "topic" --type task --plain`
3. Read with `--plain` for deterministic text, or `--json` when you need a stable machine-readable contract.
4. Write through the CLI instead of editing Markdown by hand.
5. For PowerShell, quote values that begin with `@` and use backtick newlines for multi-line text.

Output mode guidance:
- `--plain` is the default agent-safe text mode for read/search flows and post-write confirmations.
- `--json` is supported on `task create`, `task edit`, `task view`, `task list`, and `search` for automation chaining.

Modeling guidance:
- Use `--parent` when you want dotted subtasks.
- Use `--summary-parent` when you want hierarchy without blocker semantics or dotted IDs.
- Use dependency flags only for true blocker relationships.

Edit semantics that matter for reliable automation:
- `--label` replaces the whole label set; `--add-label` / `--remove-label` mutate it.
- `--acceptance-criteria` replaces the whole AC set; `--ac` appends items.
- `--notes` / `--final-summary` replace text; `--append-notes` / `--append-final-summary` append blocks.
- `task bulk` previews by default. Add `--apply` only after reviewing the match set and pending changes.

Governance workflow shortcuts:
- `backlog validate --json`
- `backlog report governance missing-documentation --plain`
- `backlog task list --missing-field documentation --plain`
- `backlog task list --missing-summary-parent --plain`
- `backlog task bulk --query "auth" --set-milestone "Release 1.0"`

## Project Setup

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Initialize project | `backlog init [project-name]` (creates backlog structure with a minimal interactive flow) |
| Re-initialize | `backlog init` (preserves existing config, allows updates) |
| Advanced settings wizard | `backlog config` (no args) — launches the full interactive configuration flow |

`backlog init` keeps first-run setup focused on the essentials:
- **Project name** – identifier for your backlog (defaults to the current directory on re-run).
- **Integration choice** – decide whether your AI tools connect through the **MCP connector** (recommended) or stick with **CLI commands (legacy)**.
- **Instruction files (CLI path only)** – when you choose the legacy CLI flow, pick which instruction files to create (CLAUDE.md, AGENTS.md, GEMINI.md, Copilot, or skip).
- **Advanced settings prompt** – default answer "No" finishes init immediately; choosing "Yes" jumps straight into the advanced wizard documented in [ADVANCED-CONFIG.md](ADVANCED-CONFIG.md).

The advanced wizard includes interactive Definition of Done defaults editing (add/remove/reorder/clear), so project checklist defaults can be managed without manual YAML edits.

You can rerun the wizard anytime with `backlog config`. All existing CLI flags (for example `--defaults`, `--agent-instructions`) continue to provide fully non-interactive setups, so existing scripts keep working without change.

## Documentation

- Document IDs are global across all subdirectories under `backlog/docs`. You can organize files in nested folders (e.g., `backlog/docs/guides/`), and `backlog doc list` and `backlog doc view <id>` work across the entire tree. Example: `backlog doc create -p guides "New Guide"`.

## Task Management

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Create task | `backlog task create "Add OAuth System"`                    |
| Create with description | `backlog task create "Feature" -d "Add authentication system"` |
| Create with assignee | `backlog task create "Feature" -a @sara`           |
| Create with status | `backlog task create "Feature" -s "In Progress"`    |
| Create with labels | `backlog task create "Feature" -l auth,backend`     |
| Create with priority | `backlog task create "Feature" --priority high`     |
| Create with plan | `backlog task create "Feature" --plan "1. Research\n2. Implement"`     |
| Create with AC | `backlog task create "Feature" --ac "Must work,Must be tested"` |
| Add DoD items on create | `backlog task create "Feature" --dod "Run tests"` |
| Create without DoD defaults | `backlog task create "Feature" --no-dod-defaults` |
| Create with notes | `backlog task create "Feature" --notes "Started initial research"` |
| Create with final summary | `backlog task create "Feature" --final-summary "PR-style summary"` |
| Create with deps | `backlog task create "Feature" --dep task-1,task-2` |
| Create with refs | `backlog task create "Feature" --ref https://docs.example.com --ref src/api.ts` |
| Create with docs | `backlog task create "Feature" --doc https://design-docs.example.com --doc docs/spec.md` |
| Create sub task | `backlog task create -p 14 "Add Login with Google"`|
| Create with summary parent | `backlog task create "Wave child" --summary-parent 14` |
| Create (all options) | `backlog task create "Feature" -d "Description" -a @sara -s "To Do" -l auth --priority high --ac "Must work" --notes "Initial setup done" --dep task-1 --ref src/api.ts --doc docs/spec.md -p 14` |
| Create with milestone | `backlog task create "Feature" --milestone "Release 1.0"` |
| List tasks  | `backlog task list [-s <status>] [-a <assignee>] [-p <parent>] [--summary-parent <task>] [-m <milestone-or-none>]` |
| List by parent | `backlog task list --parent 42` or `backlog task list -p task-42` |
| List by summary parent | `backlog task list --summary-parent 42` |
| List by governance gap | `backlog task list --missing-field documentation` |
| List invalid metadata | `backlog task list --invalid-labels --invalid-dependencies --invalid-milestones` |
| View detail | `backlog task 7` (interactive UI, press 'E' to edit in editor) |
| View (AI mode) | `backlog task 7 --plain`                           |
| View (JSON) | `backlog task 7 --json` |
| Edit        | `backlog task edit 7 -a @sara -l auth,backend`       |
| Edit (JSON) | `backlog task edit 7 -s "In Progress" --json` |
| Bulk set milestone | `backlog task milestone 7 8 --milestone "Release 1.0"` |
| Bulk clear milestone | `backlog task milestone 7 8 --clear` |
| Bulk preview labels | `backlog task bulk --select-status "To Do" --add-label governance` |
| Bulk apply docs | `backlog task bulk 7 8 --set-doc docs/spec.md --apply` |
| Bulk apply by query | `backlog task bulk --query "auth" --set-milestone "Release 1.0" --apply` |
| Add plan    | `backlog task edit 7 --plan "Implementation approach"`    |
| Add AC      | `backlog task edit 7 --ac "New criterion" --ac "Another one"` |
| Add DoD     | `backlog task edit 7 --dod "Ship notes"` |
| Remove AC   | `backlog task edit 7 --remove-ac 2` (removes AC #2)      |
| Remove multiple ACs | `backlog task edit 7 --remove-ac 2 --remove-ac 4` (removes AC #2 and #4) |
| Check AC    | `backlog task edit 7 --check-ac 1` (marks AC #1 as done) |
| Check DoD   | `backlog task edit 7 --check-dod 1` (marks DoD #1 as done) |
| Check multiple ACs | `backlog task edit 7 --check-ac 1 --check-ac 3` (marks AC #1 and #3 as done) |
| Uncheck AC  | `backlog task edit 7 --uncheck-ac 3` (marks AC #3 as not done) |
| Uncheck DoD | `backlog task edit 7 --uncheck-dod 3` (marks DoD #3 as not done) |
| Mixed AC operations | `backlog task edit 7 --check-ac 1 --uncheck-ac 2 --remove-ac 4` |
| Mixed DoD operations | `backlog task edit 7 --check-dod 1 --uncheck-dod 2 --remove-dod 4` |
| Add notes   | `backlog task edit 7 --notes "Completed X, working on Y"` (replaces existing) |
| Append notes | `backlog task edit 7 --append-notes "New findings"` |
| Add final summary | `backlog task edit 7 --final-summary "PR-style summary"` |
| Append final summary | `backlog task edit 7 --append-final-summary "More details"` |
| Clear final summary | `backlog task edit 7 --clear-final-summary` |
| Add deps    | `backlog task edit 7 --dep task-1 --dep task-2`     |
| Set milestone | `backlog task edit 7 --milestone "Release 1.0"` |
| Clear milestone | `backlog task edit 7 --clear-milestone` (alias: `--no-milestone`) |
| Set summary parent | `backlog task edit 7 --summary-parent 42` |
| Clear summary parent | `backlog task edit 7 --clear-summary-parent` |
| Archive     | `backlog task archive 7`                             |

Task edit semantics:
- `--label` replaces the full label set; `--add-label` appends unique labels; `--remove-label` removes matches.
- `--acceptance-criteria` replaces the full acceptance-criteria set; `--ac` appends new items after the current set.
- `--notes` and `--final-summary` replace existing text; `--append-notes` and `--append-final-summary` append blocks.
- `--milestone` sets the task milestone; `--clear-milestone` / `--no-milestone` removes it.
- `--parent` creates or filters dotted subtasks; `--summary-parent` models non-blocking hierarchy without dotted IDs.
- `task bulk` defaults to a preview. Add `--apply` to persist bulk label, doc, ref, notes, status, milestone, or summary-parent updates.

Bulk task workflow:
- Select tasks with explicit IDs, `--query`, or `--select-*` filters such as `--select-status`, `--select-milestone`, `--select-summary-parent`, `--select-missing-field`, `--select-invalid-labels`, `--select-invalid-dependencies`, and `--select-invalid-milestones`.
- Mutate with `--set-status`, `--set-milestone`, `--clear-milestone`, `--set-summary-parent`, `--clear-summary-parent`, `--set-labels`, `--add-label`, `--remove-label`, `--set-doc`, `--add-doc`, `--remove-doc`, `--set-ref`, `--add-ref`, `--remove-ref`, `--set-notes`, `--append-notes`, or `--clear-notes`.
- Default mode is preview-only. Use `--apply` to write the planned changes after reviewing the selection and summary.

Structured JSON output:
- `task create`, `task edit`, `task view`, `task list`, and `search` support `--json`.
- `task create` / `task edit` JSON responses include the task ID, persisted path, timestamps, and the full structured task payload for chaining.
- `task list --json` returns both grouped and flat task arrays.
- `search --json` returns typed task/document/decision result records plus counts and applied filters.

### Multi-line input (description/plan/notes/final summary)

The CLI preserves input literally; `\n` sequences are not auto-converted. Use one of the following to insert real newlines:

- **Bash/Zsh (ANSI-C quoting)**
  - Description: `backlog task create "Feature" --desc $'Line1\nLine2\n\nFinal paragraph'`
  - Plan: `backlog task edit 7 --plan $'1. Research\n2. Implement'`
  - Notes: `backlog task edit 7 --notes $'Completed A\nWorking on B'`
  - Append notes: `backlog task edit 7 --append-notes $'Added X\nAdded Y'`
  - Final summary: `backlog task edit 7 --final-summary $'Shipped A\nAdded B'`
  - Append final summary: `backlog task edit 7 --append-final-summary $'Added X\nAdded Y'`
- **POSIX sh (printf)**
  - `backlog task create "Feature" --desc "$(printf 'Line1\nLine2\n\nFinal paragraph')"`
- **PowerShell (backtick)**
  - `backlog task create "Feature" --desc "Line1`nLine2`n`nFinal paragraph"`

PowerShell tips:
- Quote values that start with `@`, such as `--assignee "@codex"`, so PowerShell does not treat them as array/hash literals.
- In a source checkout, `backlog` now prefers the repo's `src/cli.ts` runtime. `backlog --version` should match `package.json` when you are testing local changes.
- When troubleshooting Windows wrapper drift, prefer `backlog --version` and `backlog browser --no-open` as the first runtime identity checks before debugging task data.

Tip: Help text shows Bash examples with escaped `\\n` for readability; when typing, `$'\n'` expands to a newline.

## Milestones

Milestone files live under `backlog/milestones/`. The CLI mirrors the common
web flows: create files, rename (optionally rewriting tasks), remove (archive +
task cleanup), list with optional discovery output, and view one record.

| Action | Example |
|--------|---------|
| Help | `backlog milestone --help` |
| List (by task completion buckets) | `backlog milestone list --plain` |
| List completed buckets too | `backlog milestone list --show-completed --plain` |
| Append discovery report (files + orphan task labels) | `backlog milestone list --discovery --plain` |
| View one milestone | `backlog milestone view m-0 --plain` or `backlog milestone view "Release 1.0" --plain` |
| Add milestone file | `backlog milestone add "Release 1.0" -d "Scope and exit criteria" --plain` or `backlog milestone add` in a TTY wizard |
| Edit milestone description | `backlog milestone edit "Release 1.0" -d "Revised scope and exit criteria" --plain` or `backlog milestone edit` in a TTY wizard |
| Rename milestone file | `backlog milestone rename "Old" "New" --plain` (updates matching tasks by default) |
| Rename without touching tasks | `backlog milestone rename "Old" "New" --no-update-tasks --plain` |
| Remove (archives file; default clears tasks) | `backlog milestone remove "Release 1.0" --plain` |
| Remove but keep task labels | `backlog milestone remove "Release 1.0" --tasks keep --plain` |
| Remove and reassign tasks | `backlog milestone remove "Release 1.0" --tasks reassign --reassign-to "Other" --plain` |
| Archive only | `backlog milestone archive m-3 --plain` |

**Multi-line milestone description** uses the same rules as tasks (Bash
`$'…'`, POSIX `printf`, PowerShell `` `n ``).

## Search

Find tasks, documents, and decisions across your entire backlog with fuzzy search:

| Action             | Example                                              |
|--------------------|------------------------------------------------------|
| Search tasks       | `backlog search "auth"`                        |
| Filter by status   | `backlog search "api" --status "In Progress"`   |
| Filter by priority | `backlog search "bug" --priority high`        |
| Filter by milestone | `backlog search "release" --milestone "Release 1.0"` |
| Search tasks with no milestone | `backlog search --type task --milestone none` |
| Combine filters    | `backlog search "web" --status "To Do" --priority medium` |
| Plain text output  | `backlog search "feature" --plain` (for scripts/AI) |
| JSON output  | `backlog search "feature" --json` |

**Search features:**
- **Fuzzy matching** -- finds "authentication" when searching for "auth"
- **Interactive filters** -- refine your search in real-time with the TUI
- **Live filtering** -- see results update as you type (no Enter needed)

## Validation

Use `backlog validate` (alias: `backlog lint`) to check backlog governance hygiene:

| Action | Example |
|--------|---------|
| Human-readable validation report | `backlog validate` |
| Machine-readable validation report | `backlog validate --json` |
| Inspect configured validation rules | `backlog config get validation` |

Current built-in checks cover:
- Configured required task fields from `validation.requiredTaskFields`
- Broken dependencies
- Labels not declared in `config.labels`
- Task milestone IDs that do not resolve to active or archived milestone records

Use `validate` for a broad backlog-health pass. Use `report governance <name>` when you want a focused, repeatable answer for one class of governance issue.

## Governance Reports

Use repeatable named reports when you need a direct backlog-health answer instead of a generic validation dump:

| Action | Example |
|--------|---------|
| Missing documentation report | `backlog report governance missing-documentation` |
| Missing summary parent report | `backlog report governance missing-summary-parent` |
| Invalid labels report | `backlog report governance invalid-labels` |
| Invalid dependencies report | `backlog report governance invalid-dependencies` |
| Invalid milestones report | `backlog report governance invalid-milestones` |
| JSON governance report | `backlog report governance missing-documentation --json` |

For ad hoc maintenance, `task list` also supports governance filters:
- `--missing-field <field>`
- `--missing-summary-parent`
- `--invalid-labels`
- `--invalid-dependencies`
- `--invalid-milestones`

For multi-task fixes, pair those filters with `task bulk`:

```bash
backlog task bulk --select-missing-field documentation --add-doc docs/spec.md
backlog task bulk --select-invalid-labels --remove-label old-label --add-label canonical-label
backlog task bulk --select-milestone "Release 1.0" --set-summary-parent BACK-100 --apply
```

Validation config lives in `backlog/config.yml` as a JSON object on the `validation:` line. Example:

```yaml
validation: {"requiredTaskFields":["description","documentation","assignee"]}
```

## Draft Workflow

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Create draft | `backlog task create "Feature" --draft`             |
| Draft with milestone | `backlog draft create "Spike" --milestone "Exploration"` |
| Draft flow  | `backlog draft create "Spike GraphQL"` → `backlog draft promote 3.1` |
| Demote to draft| `backlog task demote <id>` |

## Dependency Management

Manage task dependencies to create execution sequences and prevent circular relationships:

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Add dependencies | `backlog task edit 7 --dep task-1 --dep task-2`     |
| Add multiple deps | `backlog task edit 7 --dep task-1,task-5,task-9`    |
| Create with deps | `backlog task create "Feature" --dep task-1,task-2` |
| View dependencies | `backlog task 7` (shows dependencies in task view)  |
| Validate dependencies | Use task commands to automatically validate dependencies |

**Dependency Features:**
- **Automatic validation**: Prevents circular dependencies and validates task existence
- **Flexible formats**: Use `task-1`, `1`, or comma-separated lists like `1,2,3`
- **Visual sequences**: Dependencies create visual execution sequences in board view
- **Completion tracking**: See which dependencies are blocking task progress

## Board Operations

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Kanban board      | `backlog board` (interactive UI, press 'E' to edit in editor) |
| Export board | `backlog board export [file]` (exports Kanban board to markdown) |
| Export with version | `backlog board export --export-version "v1.0.0"` (includes version in export) |

## Statistics & Overview

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Project overview | `backlog overview` (interactive TUI showing project statistics) |

## Web Interface

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Web interface | `backlog browser` (launches web UI on port 6420) |
| Web custom port | `backlog browser --port 8080 --no-open` |

## Documentation

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Create doc | `backlog doc create "API Guidelines"` |
| Create with path | `backlog doc create "Setup Guide" -p guides/setup` |
| Create with type | `backlog doc create "Architecture" -t technical` |
| List docs | `backlog doc list` |
| View doc | `backlog doc view doc-1` |

## Decisions

| Action      | Example                                              |
|-------------|------------------------------------------------------|
| Create decision | `backlog decision create "Use PostgreSQL for primary database"` |
| Create with status | `backlog decision create "Migrate to TypeScript" -s proposed` |

## Agent Instructions

| Action                                          | Example                                              |
|-------------------------------------------------|------------------------------------------------------|
| Update agent legacy CLI agent instruction files | `backlog agents --update-instructions` (updates CLAUDE.md, AGENTS.md, GEMINI.md, .github/copilot-instructions.md) |

## Maintenance

| Action      | Example                                                                                      |
|-------------|----------------------------------------------------------------------------------------------|
| Cleanup done tasks | `backlog cleanup` (move old completed tasks to completed folder to cleanup the kanban board) |

Full help: `backlog --help`

---

## Sharing & Export

### Board Export

Export your Kanban board to a clean, shareable markdown file:

```bash
# Export to default Backlog.md file
backlog board export

# Export to custom file
backlog board export project-status.md

# Force overwrite existing file
backlog board export --force

# Export to README.md with board markers
backlog board export --readme

# Include a custom version string in the export
backlog board export --export-version "v1.2.3"
backlog board export --readme --export-version "Release 2024.12.1-beta"
```

Perfect for sharing project status, creating reports, or storing snapshots in version control.

---

## Shell Tab Completion

Backlog.md includes built-in intelligent tab completion for bash, zsh, and fish shells. Completion scripts are embedded in the binary — no external files needed.

**Quick Installation:**
```bash
# Auto-detect and install for your current shell
backlog completion install

# Or specify shell explicitly
backlog completion install --shell bash
backlog completion install --shell zsh
backlog completion install --shell fish
```

**What you get:**
- Command completion: `backlog <TAB>` → shows all commands
- Dynamic task IDs: `backlog task edit <TAB>` → shows actual task IDs from your backlog
- Smart flags: `--status <TAB>` → shows configured status values
- Context-aware suggestions for priorities, labels, and assignees

Full documentation: See [completions/README.md](completions/README.md) for detailed installation instructions, troubleshooting, and examples.
