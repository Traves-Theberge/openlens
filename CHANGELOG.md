# Changelog

All notable changes to openlens will be documented in this file.

## [0.2.3] - 2026-03-27

### Added
- `openlens setup` now installs the `using-openlens` skill for Claude Code and Codex
- The skill teaches AI agents how to use the CLI: when to use each command, how to read output, what to do with results
- `skills/` directory included in npm package

### Changed
- Rewrote SKILL.md from command reference to workflow guide with patterns and decision logic
- README overview rewritten for clarity

## [0.2.2] - 2026-03-26

### Added
- `openlens setup` interactive wizard with @clack/prompts for polished terminal UI
- Setup wizard tests (`test/e2e/setup.test.ts`)
- `skills/using-openlens/SKILL.md` CLI usage reference for AI agents

### Changed
- Updated all packages to latest: zod 4, hono 4.12, typescript 6, yargs 18, opencode SDK 1.3.3
- Fixed "OpenLens" casing to "openlens" lowercase throughout all docs, source, hooks, and plugins
- Node engine requirement updated to >=20.19

## [0.2.1] - 2026-03-26

### Added
- Published to npm — install with `npm install -g openlens`
- Syntax highlighting in docs server (highlight.js)
- Client-side search across all wiki pages
- E2E tests for hooks install/remove (8 tests) and docs command (1 test)
- `repository`, `homepage`, `bugs`, `author` fields in package.json

### Changed
- Version now read from package.json at runtime (single source of truth)
- README installation section: npm install is now the primary method
- Platform hooks trigger only on git commit/push (removed file-write hooks)
- Codex hook config changed from TOML to JSON (`hooks.json`)

### Fixed
- CI lockfile mismatch (`bun.lock` out of sync with package.json)
- CLI help text wrapping at narrow terminal widths
- Wiki sidebar sort order (10-glossary now after 9-testing)
- Architecture tree in README: correct hook filenames, added missing files
- Removed self-dependency added during npm publish

## [0.2.0] - 2026-03-26

### Added
- Confidence scoring: agents assess confidence per finding (high/medium/low), configurable threshold via `review.minConfidence`
- Context strategies: per-agent auto-gathering of relevant files (security, bugs, performance, style)
- Structured agent reasoning: 5-step methodology with few-shot examples
- Cross-agent verification with confidence-aware grouping
- GitHub inline PR comments on specific lines via Review API
- Incremental PR updates: resolved issues marked, progress shown on re-push
- Platform plugins: Claude Code (`/openlens`), Codex CLI (`$openlens`), Gemini CLI (`/openlens`), OpenCode (native)
- `openlens docs` command — serves wiki locally with dark theme and mermaid diagrams
- `openlens hooks install/remove` — git pre-commit and pre-push hooks
- Platform hook configs for Claude Code, Gemini CLI, Codex CLI
- DeepWiki documentation (11 pages with mermaid diagrams)
- How-to guides: CLI, plugins, CI/CD, hooks
- Live progress streaming during reviews (SSE events)
- `formatGitHubReview` library export for GitHub review payloads
- `gatherStrategyContext` and `filterByConfidence` library exports
- 27 new e2e tests for v2 features (244 total)

### Fixed
- SSE stream reader — was falling back to polling, causing 180s timeouts on every review
- SARIF output corruption in CI — stderr was being redirected into the JSON file
- GitHub Action flag building — branch mode was producing malformed git diff arguments
- Base branch not available in CI checkout — added explicit fetch step

### Changed
- Agent prompts updated with explicit domain boundaries to reduce cross-agent duplication
- Severity format enforced: must be exactly "critical", "warning", or "info"
- CLI help text shortened to prevent line wrapping
- `openlens` help shows extended descriptions with quick-start examples

## [0.1.0] - 2026-03-24

### Added
- Initial release
- CLI with run, agent, init, serve, models, doctor commands
- 4 built-in agents: security, bugs, performance, style
- SARIF, JSON, text, markdown output formats
- GitHub Actions composite action
- HTTP server with Hono
- Library API with 30+ exports
- OpenCode plugin integration
- Event bus for lifecycle events
- Suppression rules and .openlensignore
- Rules discovery (AGENTS.md, CLAUDE.md)
- CI auto-detection (GitHub Actions, GitLab, CircleCI, Buildkite, Jenkins, Travis)
