# Backlog CLI Helper

Quick command helper for managing tasks and milestones in any Backlog.md
project.

Use this as the fast path. `CLI-REFERENCE.md` is the authoritative source
of truth for command semantics, modeling rules, PowerShell behavior, and
governance workflows. This file should stay concise and point back there
instead of restating detailed instructions.

## Ground Rules

- Run commands from the project root that contains the `backlog/` folder.
- Search or list before you create or bulk-edit records.
- Prefer `--plain` for agents, scripts, and deterministic parsing.
- Use `--json` on `task create`, `task edit`, `task view`, `task list`, and
  `search` when you need a stable machine-readable contract instead of text.
- Never allocate task, doc, decision, or milestone IDs manually.
- Prefer the full record ID in commands, such as `BACK-123`, `TASK-123`,
  `DOC-4`, or `m-2`, because prefixes can vary by project.
- Prefer Backlog.md commands over manual Markdown edits so metadata stays
  consistent.
- If a behavior question is not answered here, treat
  [CLI-REFERENCE.md](CLI-REFERENCE.md) as authoritative.

## Fast Task Commands

### Read and search

```bash
backlog task list --plain
backlog task list -s "To Do" --plain
backlog task list -m "Release 1.0" --plain
backlog task list -m none --plain
backlog task list --summary-parent BACK-120 --plain
backlog task list --missing-field documentation --plain
backlog task list --missing-summary-parent --plain
backlog task list --invalid-labels --plain
backlog search "auth timeout" --milestone "Release 1.0" --plain
backlog search --type task --milestone none --plain
backlog task view BACK-123 --plain
backlog task view BACK-123 --json
backlog search "auth timeout" --plain
backlog search "auth timeout" --json
backlog validate
backlog validate --json
backlog report governance missing-documentation
backlog report governance missing-summary-parent --json
backlog overview
backlog board
```

### Create

```bash
backlog task create "Add OAuth login" --plain
backlog task create "Add OAuth login" --json
backlog task create "Add OAuth login" \
  -d "Implement the first login flow for browser users." \
  -s "To Do" \
  -a @codex \
  -l auth,backend \
  --priority high \
  --milestone "Release 1.0" \
  --ac "Browser login succeeds with valid credentials" \
  --ac "Invalid credentials return a bounded error" \
  --doc docs/auth-contract.md \
  --ref https://example.com/spec \
  --plain
```

### Update status, ownership, and metadata

```bash
backlog task edit BACK-123 -s "In Progress" -a @codex --plain
backlog task edit BACK-123 -s "In Progress" -a @codex --json
backlog task edit BACK-123 -l auth,backend,bug --priority high --plain
backlog task edit BACK-123 --milestone "Release 2.0" --plain
backlog task edit BACK-123 --clear-milestone --plain
backlog task edit BACK-123 --no-milestone --plain
backlog task edit BACK-123 --summary-parent BACK-100 --plain
backlog task edit BACK-123 --clear-summary-parent --plain
backlog task milestone BACK-123 BACK-124 --milestone "Release 2.0" --plain
backlog task milestone BACK-123 BACK-124 --clear --plain
backlog task bulk --select-status "To Do" --add-label governance
backlog task bulk BACK-123 BACK-124 --set-doc docs/auth-contract.md --apply
backlog task bulk --query "auth" --set-milestone "Release 2.0" --apply
backlog task edit BACK-123 --append-notes "Investigated the failing login flow." --plain
backlog task edit BACK-123 --plan "1. Reproduce\n2. Patch\n3. Verify" --plain
backlog task edit BACK-123 --final-summary "Implemented bounded login validation and added coverage." --plain
```

Key reminders:
- Use `--json` when a wrapper needs structured output.
- Use `--summary-parent` for non-blocking hierarchy; use `--parent` for dotted subtasks.
- `task bulk` previews by default; add `--apply` to persist changes.
- Detailed edit semantics and governance behavior live in [CLI-REFERENCE.md](CLI-REFERENCE.md).

### Manage acceptance criteria and DoD

```bash
backlog task edit BACK-123 --ac "Audit event is written" --plain
backlog task edit BACK-123 --check-ac 1 --plain
backlog task edit BACK-123 --remove-ac 2 --plain
backlog task edit BACK-123 --dod "Release notes updated" --plain
backlog task edit BACK-123 --check-dod 1 --plain
```

### Dependencies, parentage, and cleanup

```bash
backlog task create "Implement callback handler" --depends-on BACK-123 --plain
backlog task create "Add UI polish" -p BACK-123 --plain
backlog task create "Wave child" --summary-parent BACK-123 --plain
backlog task edit BACK-124 --dep BACK-123,BACK-122 --plain
backlog task archive BACK-124
backlog cleanup
```

## Fast Milestone Commands

Milestones are normal Markdown files under `backlog/milestones/`. The CLI can
create, inspect, rename, remove (archive + optional task cleanup), and list
them without starting the browser.

```bash
backlog milestone --help
backlog milestone list --plain
backlog milestone list --show-completed --plain
backlog milestone list --discovery --plain
backlog milestone view m-0 --plain
backlog milestone view "Release 1.0" --plain
backlog milestone add
backlog milestone add "Release 1.0" -d "Scope and exit criteria" --plain
backlog milestone edit
backlog milestone edit "Release 1.0" -d "Revised scope and exit criteria" --plain
backlog milestone rename "Old title" "New title" --plain
backlog milestone rename "Old title" "New title" --no-update-tasks --plain
backlog milestone remove "Release 1.0" --tasks clear --plain
backlog milestone remove "Release 1.0" --tasks keep --plain
backlog milestone remove "Release 1.0" --tasks reassign --reassign-to "Release 2.0" --plain
backlog milestone archive m-3 --plain
```

**Task ↔ milestone:** use `--milestone` on `task create` / `draft create`, or
`task edit --milestone …`. Clear the link with `task edit --clear-milestone` or
`--no-milestone`. For bulk updates, use `task milestone <ids...> --milestone …`
or `task milestone <ids...> --clear`. Values are resolved the same way as the
web UI (id, `m-N`, numeric id, or an unambiguous title).

**List tasks by milestone:** `task list -m <name>` filters to that milestone;
`task list -m none` shows tasks with no milestone.

**Interactive milestone wizard:** in a TTY, `milestone add` prompts for the
title and description when you omit the title, and `milestone edit` can prompt
you to pick a milestone and update its description when the name and/or
description is omitted.

## PowerShell Notes

- Quote values that start with `@`, such as `--assignee "@codex"`.
- Use PowerShell backticks for real newlines, for example `--notes "Line1`nLine2"`.
- In a source checkout, `backlog` prefers the repo's `src/cli.ts` runtime, so `backlog --version` should match `package.json` when you are testing local changes.
- For wrapper debugging, verify the runtime before debugging data: `backlog --version` and `backlog browser --no-open`.

PowerShell examples:

```powershell
backlog task edit BACK-123 -s "In Progress" -a "@codex" --plain
backlog task edit BACK-123 --append-notes "Line1`nLine2" --plain
backlog milestone add "Release 1.0" -d "Scope`nExit criteria" --plain
```

## Optional: browser API

If you already run `backlog browser`, you can still call the JSON API (for
example from CI) to create or archive milestones; the CLI above is equivalent
for most workflows.

```bash
backlog browser --no-open
```

Default URL:

```text
http://localhost:6420
```

Create a milestone through the HTTP API:

```bash
curl -X POST http://localhost:6420/api/milestones \
  -H "Content-Type: application/json" \
  -d '{"title":"Release 1.0","description":"Scope and exit criteria"}'
```

PowerShell example:

```powershell
$body = @{
  title = "Release 1.0"
  description = "Scope and exit criteria"
} | ConvertTo-Json

Invoke-RestMethod `
  -Method Post `
  -Uri "http://localhost:6420/api/milestones" `
  -ContentType "application/json" `
  -Body $body
```

Archive a milestone through the HTTP API:

```bash
curl -X POST http://localhost:6420/api/milestones/m-3/archive
```

## Recommended Agent Flow

1. Search first to avoid duplicates.
2. Read with `--plain` before making changes.
3. Create or edit tasks through the CLI instead of editing files directly.
4. Use `milestone add` / `milestone list --discovery` when you need explicit
   milestone files, and `--milestone` on tasks to attach work.
5. Keep notes current while working.
6. Use `final-summary` when closing work so the completion record is useful.

If you need exact semantics for edit flags, governance filters, validation
rules, or shell-specific behavior, jump to [CLI-REFERENCE.md](CLI-REFERENCE.md).
