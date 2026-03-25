# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Development Commands

```bash
bun install              # Install dependencies
bun run dev              # Run from source (alias for: bun run src/index.ts)
bun run build            # Compile TypeScript to dist/
bun run typecheck        # Type-check without emitting (tsc --noEmit)
bun test                 # Run all tests (Bun test runner)
bun test test/unit/config.test.ts  # Run a single test file
```

No linter is configured; TypeScript strict mode is the primary code quality gate.

## Architecture

OpenLens is an AI-powered code review tool with four interfaces: **CLI** (yargs), **library** (programmatic API), **HTTP server** (Hono), and **OpenCode plugin**.

### Core Flow

1. **Config loading** (`src/config/config.ts`) — Layered resolution: built-in defaults → `~/.config/openlens/openlens.json` → `./openlens.json` → `OPENLENS_*` env vars → CLI flags. Validated with Zod schemas in `src/config/schema.ts`.
2. **Agent loading** (`src/agent/agent.ts`) — Resolves prompt from inline string, `{file:path}` reference, or built-in markdown in `agents/`. Parses YAML frontmatter, merges permissions (defaults → global config → frontmatter → agent config).
3. **Diff collection** (`src/tool/diff.ts`) — Gets staged, unstaged, or branch diff via git commands.
4. **Review orchestration** (`src/session/review.ts`) — Runs agents in parallel (up to `maxConcurrency`, default 4) via the OpenCode SDK. Each agent receives project instructions + diff + optional full file context. Results are parsed as JSON, suppressed issues filtered, then an optional verification pass re-examines flagged issues.
5. **Output formatting** (`src/output/format.ts`) — Text (ANSI), JSON, SARIF v2.1.0, or GitHub-flavored Markdown.

### Key Design Decisions

- **Read-only by default**: Agent permissions default to allowing only read/grep/glob/list/lsp/skill. Write/edit/bash are denied unless explicitly configured per-agent.
- **Suppression system** (`src/suppress.ts`): File-glob and text-pattern matching from config or `.openlensignore`.
- **Rules discovery** (`src/config/rules.ts`): Walks from working directory up to git root looking for `AGENTS.md`, `CLAUDE.md`, `.openlens/rules.md` to inject project conventions into agent prompts.
- **CI detection** (`src/env.ts`): Auto-detects GitHub Actions, GitLab CI, CircleCI, Buildkite, Jenkins, Travis and infers base branches from their env vars.
- **Event bus** (`src/bus/index.ts`): Lifecycle events (agent.started/completed/failed, review.completed) for programmatic consumers.
- **Default model**: `opencode/big-pickle` — free model, no API keys required.

### Confidence Scoring

Issues carry a `confidence` field (`"high"` / `"medium"` / `"low"`). Each agent assesses confidence per finding. Issues below `review.minConfidence` (default `"medium"`) are filtered before output. The optional verification pass can boost or downgrade confidence based on cross-agent agreement.

### Context Strategies

Agents can declare a `context` field in config/frontmatter. `src/context/strategy.ts` auto-gathers relevant files per strategy:

- **security**: dependency manifests, auth-related files
- **bugs**: callers/callees of changed functions
- **performance**: callers + route handlers/middleware
- **style**: linter/formatter configs

Capped at 10 files / 5000 lines per agent.

### GitHub Review Integration

`src/output/github-review.ts` formats results as GitHub PR review payloads with inline comments on specific lines. Issues are fingerprinted (sha256 of file+title+agent, excluding line number) for incremental updates — resolved issues get marked on re-runs.

### Plugins

`plugins/` contains thin adapters for AI coding platforms:

- `plugins/claude-code/SKILL.md` — Claude Code `/openlens` slash command
- `plugins/codex/` — Codex CLI plugin manifest + tools
- `plugins/gemini/` — Gemini CLI tool registration

All plugins shell out to `openlens run --format json` or call the library API directly.

### Package Exports

- `openlens` (main): Library API from `src/lib.ts`
- `openlens/plugin`: OpenCode plugin from `src/plugin.ts` registering tools: `openlens`, `openlens-delegate`, `openlens-conventions`, `openlens-agents`

## Testing

Tests use Bun's built-in test runner (`bun:test`). Three tiers:

- **Unit** (`test/unit/`): Config, agent loading, diff parsing, formatting, suppression, server endpoints
- **Integration** (`test/integration/`): Full review workflow
- **E2E** (`test/e2e/`): CLI commands via subprocess. Uses `test/e2e/helpers.ts` for temp git repo creation and CLI execution.

CI runs: typecheck → unit tests → CLI smoke tests (`.github/workflows/ci.yml`).

## Schemas

All config and data shapes are defined as Zod schemas. `src/types.ts` has `IssueSchema` and `ReviewResultSchema`. `src/config/schema.ts` has `ConfigSchema` and `AgentConfigSchema`. Always validate through these schemas rather than ad-hoc type checks.
