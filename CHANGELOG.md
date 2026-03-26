# Changelog

All notable changes to OpenLens will be documented in this file.

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
