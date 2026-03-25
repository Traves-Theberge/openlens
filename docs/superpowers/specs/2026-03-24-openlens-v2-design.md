# OpenLens v2 Design Spec

## Vision

OpenLens becomes a universal AI code review engine that runs locally, in CI/CD, and as a native plugin for any AI coding agent (OpenCode, Claude Code, Codex, Gemini CLI). The core ethos stays: user owns the prompts, read-only by default, free models work, hackable and extensible.

## 1. Native Plugin Integrations

### Problem
OpenLens only integrates with OpenCode today. Claude Code, Codex, and Gemini CLI users can't use it without manually running the CLI.

### Solution
Create thin plugin adapters for each platform that call the OpenLens library API directly — no HTTP server needed. If a target platform only supports MCP tool servers (no direct library imports), fall back to wrapping the library in a stdio MCP transport.

### Plugins

**OpenCode** (existing): `src/plugin.ts` — already registers `openlens`, `openlens-delegate`, `openlens-conventions`, `openlens-agents` tools. No changes needed.

**Claude Code**: `plugins/claude-code/` — a Claude Code skill that registers `/review` as a slash command. Calls `runReview()` from `src/lib.ts`. Returns structured results the host agent can reason about.

**Codex CLI**: `plugins/codex/` — Codex plugin manifest + tool definitions. Same library API calls.

**Gemini CLI**: `plugins/gemini/` — Gemini CLI tool registration. Same library API calls.

### Shared Interface

All plugins call the same functions exported from `src/lib.ts`:

```typescript
runReview(config: Config, mode?: string, cwd?: string): Promise<ReviewResult>
runSingleAgentReview(config: Config, agent: Agent, focus: { question: string; files?: string[] }, cwd?: string): Promise<ReviewResult>
loadAgents(config: Config, cwd: string): Promise<Agent[]>
loadConfig(cwd: string): Promise<Config>
```

Each plugin is a thin adapter that translates between the host platform's tool/skill format and these TypeScript functions.

## 2. Review Quality Improvements

### Problem
All agents get the same context blob (diff + full files). They don't get context tailored to their specialization. Prompts use a simple "find problems" approach without structured reasoning.

### Solution

#### 2a. Smarter Context Strategy Per Agent

Add an optional `context` field to agent config/frontmatter that specifies a built-in context strategy:

```yaml
# in agent frontmatter or openlens.json agent config
context: security  # one of: security, bugs, performance, style, or omitted for default
```

Schema addition to `AgentConfigSchema`:
```typescript
context: z.enum(["security", "bugs", "performance", "style"]).optional()
```

Each strategy auto-gathers additional files:

- **security**: dependency manifests (`package.json`, `requirements.txt`, `go.mod`), auth-related files (grep for `auth`, `middleware`, `session`), environment configs
- **bugs**: callers/callees of changed functions (grep for function names, include those files), imported module signatures
- **performance**: request handlers and loop contexts where changed functions are called
- **style**: linter configs (`.eslintrc`, `.prettierrc`, `biome.json`), convention files

**Performance bounds:** Strategy context is capped at 10 files and 5,000 lines total per agent. Strategy context supplements (does not replace) the existing `readChangedFiles` output when `fullFileContext` is enabled. If an agent sets `fullFileContext: false`, only strategy context is included.

Implementation: new module `src/context/strategy.ts` that takes an agent config + diff and returns additional file context. Called before `runSingleAgent` to augment the file context per agent.

#### 2b. Better Prompt Engineering

Update agent prompt templates to use structured reasoning:

1. Classify each change (new code, modified logic, refactor, config change)
2. Decide which changes are relevant to this agent's focus
3. Investigate relevant changes using tools
4. Report findings with confidence level

Add few-shot examples of good vs bad issue reports in each agent prompt.

**Confidence field:** Add to the issue schema:
```typescript
confidence: z.enum(["high", "medium", "low"]).default("high")
```

Agents must state confidence for each issue. Default reporting threshold is `medium` — issues below the threshold are excluded from output. Configurable via `review.minConfidence` in `openlens.json`:
```json
{ "review": { "minConfidence": "low" } }
```

The confidence field appears in all output formats:
- **JSON**: included as a field
- **SARIF**: mapped to `result.rank` (high=9, medium=5, low=1)
- **Markdown**: shown as a badge next to severity
- **Text**: shown in parentheses after severity

#### 2c. Improved Cross-Agent Verification

The existing verification pass gets a new prompt template and structured input. Instead of receiving a flat list of issues, the verifier receives issues grouped by agent with their confidence levels.

The verification is **prompt-based** — the verifier agent decides what to keep/remove. New decision logic in the prompt:
- If multiple agents flag the same location, boost to high confidence
- If only one agent flags something at low confidence, remove unless the verifier confirms it
- The verifier may downgrade or upgrade confidence based on its own investigation

No deterministic code filtering — the verifier agent makes all decisions. This keeps the system hackable (users can edit the verifier prompt).

## 3. GitHub Inline PR Comments

### Problem
The GitHub Action posts one summary comment. Developers want inline comments on the exact lines where issues are found, like CodeRabbit.

### Solution

#### 3a. Line-Level Review Comments

New output formatter: `formatGitHubReview(result, options)` that produces a GitHub pull request review payload:
- Each issue becomes a review comment with `path`, `line` (or `start_line`/`line` for ranges), and `body`
- All comments submitted as a single review via `POST /repos/{owner}/{repo}/pulls/{pull_number}/reviews`
- Review event based on severity:
  - Critical issues: `REQUEST_CHANGES`
  - Warnings/info only: `COMMENT`
  - No issues: `APPROVE`

#### 3b. Incremental Updates on New Pushes

When the action runs again on a new push to the same PR:
- Compare current issues against previous review
- Resolve (hide/delete) comments for issues that no longer appear
- Post new comments only for new or changed issues
- Update the summary comment to show progress (e.g. "3 issues -> 1 remaining")

**State tracking:** Embed a JSON marker in a hidden HTML comment within the summary comment containing the previous issue fingerprints. On re-run, read this marker to diff against current results. This replaces the current `<!-- openlens-review -->` marker with `<!-- openlens-review-state: {...} -->`.

**Issue fingerprint:** `sha256(file + title + agent)` — excludes line number since lines shift on rebase/edit. Two issues are considered "the same" if they share a fingerprint. If the same fingerprint appears on a different line, the existing comment is updated (not duplicated).

#### 3c. Action Updates

Update `action.yml` and `.github/workflows/pr-review.yml`:
- Use `gh api` to submit reviews with inline comments instead of posting a single comment
- Add `inline-comments` input (default: true) to opt in/out
- Add `auto-resolve` input (default: true) to control comment resolution on re-runs
- Keep SARIF upload as a parallel output path (unchanged)

## Implementation Order

1. **Plugin integrations** — Claude Code skill first (we use it), then Codex, then Gemini
2. **Review quality** — context strategies, then prompt improvements, then cross-agent verification
3. **GitHub inline comments** — review formatter, then action updates, then incremental updates

## Non-Goals

- MCP server as primary integration (plugins call library directly; MCP is a fallback only)
- Feedback/learning system (edit the agent prompts instead)
- Incremental/partial diff reviews (full diff is fine for diffs under ~100 files / 50k lines; revisit if this becomes a bottleneck)
- IDE extensions (plugins for AI agents cover this)
