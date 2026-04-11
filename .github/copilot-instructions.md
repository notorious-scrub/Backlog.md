# ⚠️ **IMPORTANT**

1. Read the [README.md](README.md)
2. Read the [agent-guidelines.md](src/guidelines/agent-guidelines.md)

## Commands

### Development

- `bun i` - Install dependencies
- `bun test` - Run tests
- `bun run format` - Format code with Biome
- `bun run lint` - Lint and auto-fix with Biome
- `bun run check` - Run all Biome checks (format + lint)
- `bun run build` - Build the CLI tool
- `bun run cli` - Uses the CLI tool directly

### Testing

- `bun test` - Run all tests
- `bun test <filename>` - Run specific test file

### Configuration Management

- `bun run cli config list` - View all configuration values
- `bun run cli config get <key>` - Get a specific config value (e.g. defaultEditor)
- `bun run cli config set <key> <value>` - Set a config value with validation

### Backlog CLI: milestones

In a Backlog.md project, use **`backlog milestone …`** for files under `backlog/milestones/` (avoid hand-editing). Link work with `backlog task create/edit --milestone`, bulk `backlog task milestone <ids…> --milestone "…"` or `--clear`, list with `backlog task list -m …`, and search with `backlog search … --milestone …`.

Common commands: `backlog milestone --help`, `backlog milestone list --plain` (optional `--show-completed`, `--discovery`), `backlog milestone view … --plain`, `backlog milestone add` / `milestone edit`, `backlog milestone rename`, `backlog milestone remove … --tasks …`, `backlog milestone archive …`. Use **`--plain`** for machine-readable output.

Details: [backlog-cli.md](backlog-cli.md), [CLI-INSTRUCTIONS.md](CLI-INSTRUCTIONS.md).

## Core Structure

- **CLI Tool**: Built with Bun and TypeScript as a global npm package (`npm i -g backlog.md`)
- **Source Code**: Located in `/src` directory with modular TypeScript structure
- **Task Management**: Uses markdown files in `backlog/` directory structure
- **Workflow**: Git-integrated with task IDs referenced in commits and PRs

## Code Standards

- **Runtime**: Bun with TypeScript 5
- **Formatting**: Biome with tab indentation and double quotes
- **Linting**: Biome recommended rules
- **Testing**: Bun's built-in test runner
- **Pre-commit**: Husky + lint-staged automatically runs Biome checks before commits

The pre-commit hook automatically runs `biome check --write` on staged files to ensure code quality. If linting errors
are found, the commit will be blocked until fixed.

## Git Workflow

- **Branching**: Use feature branches when working on tasks (e.g. `tasks/task-123-feature-name`)
- **Committing**: Use the following format: `TASK-123 - Title of the task`
