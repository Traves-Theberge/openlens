# Glossary

Key terms used throughout the OpenLens documentation.

---

**Agent** — A specialized AI reviewer defined as a markdown file with YAML frontmatter. Each agent has its own prompt, model, permissions, and focus area. See [Agent System](3-agent-system.md).

**Confidence** — A per-issue assessment of how certain the agent is about a finding. Values: `high`, `medium`, `low`. Issues below the `minConfidence` threshold are filtered out. See [Agent System § Confidence Scoring](3-agent-system.md).

**Context Strategy** — An optional per-agent setting that auto-gathers relevant files before review. Strategies: `security` (dependency manifests, auth files), `bugs` (callers of changed functions), `performance` (route handlers, callers), `style` (linter configs). See [Agent System § Context Strategies](3-agent-system.md).

**Deduplication** — Post-review step that removes duplicate findings. Issues are keyed by `file:line:endLine:title` — when two agents find the same issue, the higher-severity one wins. See [Review Pipeline](5-review-pipeline.md).

**Diff Mode** — How OpenLens selects code to review: `staged` (git add), `unstaged` (working tree), `branch` (vs base branch), or `auto` (tries each in order). See [CLI Reference](6-cli-reference.md).

**Event Bus** — Pub/sub system for review lifecycle events (`review.started`, `agent.started`, `agent.progress`, `agent.completed`, `agent.failed`, `review.completed`). See [Core Architecture](2-core-architecture.md).

**Fingerprint** — A SHA-256 hash of `file + title + agent` (excluding line number) used to track issues across PR pushes. Enables incremental updates — resolved issues get marked, new ones get posted. See [Output Formats § GitHub Review](7-output-formats.md).

**Frontmatter** — YAML metadata at the top of agent markdown files (between `---` delimiters). Configures description, mode, model, steps, permissions, and context strategy. Parsed by `gray-matter`.

**Issue** — A single finding from a review. Fields: `file`, `line`, `endLine?`, `severity`, `confidence`, `agent`, `title`, `message`, `fix?`, `patch?`. Defined by `IssueSchema` in `src/types.ts`.

**MCP (Model Context Protocol)** — A protocol for connecting external tool servers to AI agents. OpenLens passes MCP configuration through to OpenCode, allowing agents to access custom tools during reviews. See [Configuration](4-configuration.md).

**minConfidence** — Config setting (`review.minConfidence`) that filters issues below a confidence threshold. Default: `medium`. See [Configuration](4-configuration.md).

**OpenCode** — The open-source AI coding agent that OpenLens is built on. Provides the model provider SDK, tool execution runtime, and session management. See [github.com/anomalyco/opencode](https://github.com/anomalyco/opencode).

**Permission** — Controls what tools an agent can use during review. Values: `allow`, `deny`, `ask`. Supports granular patterns for tools like `bash`. Inherited through 4 layers: defaults → global config → frontmatter → agent config. See [Agent System § Permissions](3-agent-system.md).

**Primary Agent** — An agent with `mode: primary` that orchestrates other agents. Can delegate tasks to subagents. See [Agent System](3-agent-system.md).

**ReviewResult** — The structured output of a review. Contains `issues` (array), `timing` (per-agent milliseconds), and `meta` (mode, filesChanged, agentsRun, agentsFailed, suppressed, verified). Defined by `ReviewResultSchema` in `src/types.ts`.

**Rules Discovery** — The system that walks from working directory to git root looking for `AGENTS.md`, `CLAUDE.md`, `.openlens/rules.md` and other instruction files. These get injected into agent prompts. See [Configuration § Rules Discovery](4-configuration.md).

**SARIF** — Static Analysis Results Interchange Format v2.1.0. An industry-standard JSON format for static analysis results. Used for GitHub Code Scanning and GitLab SAST integration. See [Output Formats § SARIF](7-output-formats.md).

**Severity** — How critical an issue is. Values: `critical` (must fix), `warning` (should fix), `info` (suggestion). Maps to SARIF levels: `error`, `warning`, `note`.

**Subagent** — An agent with `mode: subagent` (the default). Runs as part of a parallel review batch. Cannot delegate to other agents. See [Agent System](3-agent-system.md).

**Suppression** — Rules for silencing known noise. File-glob patterns match file paths, text patterns match issue titles/messages. Configured in `openlens.json` or `.openlensignore`. See [Configuration § Suppression](4-configuration.md).

**Verification Pass** — An optional post-review step where a verifier agent re-examines all findings grouped by agent. Can boost, downgrade, or remove issues based on cross-agent agreement and its own investigation. See [Review Pipeline § Verification](5-review-pipeline.md).
