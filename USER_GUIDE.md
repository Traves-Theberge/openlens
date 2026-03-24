# OpenLens User Guide

> AI-powered code review for your terminal.

OpenLens orchestrates specialized AI agents that review your git diffs in parallel — catching security vulnerabilities, bugs, performance issues, and style violations before they land. Each agent has read-only access to your full codebase, enabling deep analysis that goes beyond surface-level pattern matching.

Built on the [OpenCode](https://github.com/anomalyco/opencode), OpenLens supports any model provider OpenCode supports: Anthropic, OpenAI, Google, AWS Bedrock, Groq, and more.

---

## Table of Contents

1. [Installation](#1-installation)
2. [Getting Started](#2-getting-started)
3. [Configuration](#3-configuration)
4. [Agents](#4-agents)
5. [Skills](#5-skills)
6. [CLI Reference](#6-cli-reference)
7. [Output Formats & SARIF](#7-output-formats--sarif)
8. [HTTP Server API](#8-http-server-api)
9. [CI/CD Integration](#9-cicd-integration)
10. [Library & Plugin API](#10-library--plugin-api)
11. [Advanced Topics](#11-advanced-topics)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Installation

### Prerequisites

- [Bun](https://bun.sh/) 1.0+ (recommended) or Node.js 18+
- Git
- A model provider configured via [OpenCode](https://github.com/anomalyco/opencode) (see [Environment Setup](#environment-setup))

### Install from Source

```bash
git clone https://github.com/Traves-Theberge/OpenLens.git
cd OpenLens
bun install
```

### Run Directly

```bash
bun run src/index.ts run
```

### Build and Link Globally

```bash
bun run build
bun link
openlens run
```

After linking, the `openlens` command is available system-wide.

### Environment Setup

OpenLens uses the [OpenCode](https://github.com/anomalyco/opencode) for model provider access. OpenCode supports multiple configuration methods:

**Option 1: Environment variables** (simplest)

```bash
# Set one of the supported provider keys
export ANTHROPIC_API_KEY="sk-ant-..."   # Anthropic (default)
export OPENAI_API_KEY="sk-..."          # OpenAI
export GEMINI_API_KEY="..."             # Google Gemini
export GROQ_API_KEY="..."               # Groq
export GITHUB_TOKEN="..."               # GitHub Copilot
```

**Option 2: OpenCode config file** (recommended for persistent setup)

Create `opencode.json` in your project root:

```json
{
  "$schema": "https://opencode.ai/config.json",
  "provider": {
    "anthropic": {
      "npm": "@ai-sdk/anthropic",
      "models": {
        "claude-sonnet-4-20250514": {
          "name": "Claude Sonnet 4"
        }
      }
    }
  }
}
```

API keys are managed via `opencode /connect` (stored in `~/.local/share/opencode/auth.json`) or set as environment variables.

OpenCode discovers providers automatically — see the [OpenCode documentation](https://github.com/anomalyco/opencode) for the full list of 75+ supported providers (Anthropic, OpenAI, Google, AWS Bedrock, Azure OpenAI, Groq, GitHub Copilot, and more).

---

## 2. Getting Started

### Initialize Your Project

Run `openlens init` in your project root to scaffold configuration and agent templates:

```bash
cd your-project
openlens init
```

This creates:

- **`openlens.json`** — project configuration with four default agents
- **`agents/`** — directory containing the built-in agent prompt files:
  - `security.md` — vulnerability and secrets scanner
  - `bugs.md` — logic error and edge case detector
  - `performance.md` — performance bottleneck finder
  - `style.md` — convention and dead code checker

The command is idempotent — it won't overwrite existing files.

### Your First Review

Stage some changes and run a review:

```bash
git add -p                     # stage changes
openlens run --staged          # review them
```

OpenLens will:

1. Collect the git diff for your staged changes
2. Launch all enabled agents in parallel (up to `maxConcurrency`)
3. Each agent analyzes the diff with full codebase access
4. Run a verification pass to filter false positives
5. Print results grouped by severity

### Diff Modes

OpenLens supports four ways to select what code gets reviewed:

| Mode        | Flag            | What It Reviews                          |
| ----------- | --------------- | ---------------------------------------- |
| **staged**  | `--staged`      | Changes in the staging area (`git add`)  |
| **unstaged**| `--unstaged`    | Uncommitted working tree changes         |
| **branch**  | `--branch main` | All commits on your branch vs. a base    |
| **auto**    | *(default)*     | Tries staged → unstaged → branch         |

```bash
# Review uncommitted changes
openlens run --unstaged

# Review everything on your feature branch vs. main
openlens run --branch main

# Let OpenLens pick the first non-empty mode
openlens run
```

### Selective Agent Runs

Run only the agents you need:

```bash
# Only security and bugs
openlens run --agents security,bugs

# Everything except style
openlens run --exclude-agents style
```

### Dry Run

Preview what would happen without making API calls:

```bash
openlens run --dry-run
```

### Check Your Setup

Validate that everything is configured correctly:

```bash
openlens doctor
```

This checks: git availability, OpenCode binary, API keys, config file validity, agent configurations, MCP server connectivity, and CI environment detection.

---

## 3. Configuration

### Config File Locations

OpenLens loads configuration from multiple sources, merged in order (last wins):

| Priority | Source                                  | Scope   |
| -------- | --------------------------------------- | ------- |
| 1        | Built-in defaults                       | —       |
| 2        | `~/.config/openlens/openlens.json`      | Global  |
| 3        | `./openlens.json` or `./openlens.jsonc` | Project |
| 4        | Environment variables                   | Session |
| 5        | CI environment defaults (auto-detected) | CI      |

Both `.json` and `.jsonc` (JSON with comments) are supported.

### Full Configuration Reference

```json
{
  "$schema": "https://openlens.dev/config.json",

  "model": "anthropic/claude-sonnet-4-20250514",

  "agent": {
    "security": {
      "description": "Security vulnerability scanner",
      "mode": "subagent",
      "model": "anthropic/claude-sonnet-4-20250514",
      "prompt": "{file:./agents/security.md}",
      "steps": 5,
      "disable": false,
      "hidden": false,
      "color": "#FF0000",
      "fullFileContext": true,
      "permission": {
        "read": "allow",
        "grep": "allow",
        "glob": "allow",
        "list": "allow",
        "edit": "deny",
        "bash": "deny"
      }
    }
  },

  "permission": {
    "read": "allow",
    "grep": "allow",
    "glob": "allow",
    "list": "allow",
    "edit": "deny",
    "bash": "deny"
  },

  "review": {
    "defaultMode": "staged",
    "instructions": ["REVIEW.md"],
    "baseBranch": "main",
    "fullFileContext": true,
    "verify": true,
    "timeoutMs": 180000,
    "maxConcurrency": 4,
    "rules": {
      "enabled": true,
      "extraFiles": [],
      "include": [],
      "exclude": [],
      "maxDepth": 20
    }
  },

  "suppress": {
    "files": ["generated/**", "vendor/**"],
    "patterns": ["TODO"]
  },

  "server": {
    "port": 4096,
    "hostname": "localhost"
  },

  "mcp": {},

  "disabled_agents": []
}
```

### Review Options

| Option            | Type     | Default          | Description                                    |
| ----------------- | -------- | ---------------- | ---------------------------------------------- |
| `defaultMode`     | string   | `"staged"`       | Default diff mode: staged, unstaged, branch, auto |
| `instructions`    | string[] | `["REVIEW.md"]`  | Files with project-specific review guidance     |
| `baseBranch`      | string   | `"main"`         | Base branch for branch-mode diffs               |
| `fullFileContext`  | boolean  | `true`           | Include full source of changed files            |
| `verify`          | boolean  | `true`           | Run verification pass to filter false positives |
| `timeoutMs`       | number   | `180000`         | Timeout per agent in milliseconds               |
| `maxConcurrency`  | number   | `4`              | Max agents running in parallel                  |
| `rules`           | object   | `{enabled:true}` | Rules discovery config (see [Rules Discovery](#review-instructions--rules-discovery)) |

### Template Substitution

Config values support two template patterns:

- **`{file:./path.md}`** — loads content from a file (path relative to config directory)
- **`{env:VAR_NAME}`** — substitutes an environment variable

```json
{
  "agent": {
    "security": {
      "prompt": "{file:./agents/security.md}",
      "model": "{env:OPENLENS_SECURITY_MODEL}"
    }
  }
}
```

### Environment Variables

**Provider keys** (passed through to OpenCode — set any one, or use an OpenCode config file instead):

| Variable              | Description                              |
| --------------------- | ---------------------------------------- |
| `ANTHROPIC_API_KEY`   | Anthropic API key                        |
| `OPENAI_API_KEY`      | OpenAI API key                           |
| `GEMINI_API_KEY`      | Google Gemini API key                    |
| `GROQ_API_KEY`        | Groq API key                             |
| `GITHUB_TOKEN`        | GitHub Copilot token                     |

**OpenLens overrides:**

| Variable              | Description                              |
| --------------------- | ---------------------------------------- |
| `OPENLENS_MODEL`      | Override global model                    |
| `OPENLENS_PORT`       | Override server port                     |
| `OPENLENS_MODE`       | Default review mode                      |
| `OPENLENS_BASE_BRANCH`| Base branch for diffs                    |
| `OPENCODE_BIN`        | Explicit path to OpenCode binary         |
| `NO_COLOR`            | Disable ANSI color output                |

### Permission System

Permissions control what tools each agent can use. Three values:

| Value     | Behavior                       |
| --------- | ------------------------------ |
| `"allow"` | Tool executes without approval |
| `"deny"`  | Tool is blocked                |
| `"ask"`   | Requires user confirmation     |

Permissions cascade through four layers (last wins):

1. Built-in defaults (read-only codebase access)
2. Global `permission` block in config
3. YAML frontmatter in the agent's `.md` file
4. Agent-specific `permission` in config

#### Granular Bash Patterns

For fine-grained shell command control, use pattern matching:

```json
{
  "permission": {
    "bash": {
      "git *": "allow",
      "npm test": "allow",
      "rm *": "deny",
      "*": "ask"
    }
  }
}
```

### Available Tools

| Tool         | Description                          |
| ------------ | ------------------------------------ |
| `read`       | Read file contents                   |
| `edit`       | Modify files (exact string replace)  |
| `write`      | Create or overwrite files            |
| `glob`       | Find files by pattern                |
| `grep`       | Search file contents (regex)         |
| `list`       | List directory contents              |
| `bash`       | Execute shell commands               |
| `patch`      | Apply patch files to codebase        |
| `lsp`        | LSP code intelligence (experimental) |
| `webfetch`   | Fetch data from URLs                 |
| `websearch`  | Search the web                       |
| `task`       | Run sub-tasks with a subagent        |
| `skill`      | Load reusable skill instructions     |
| `codesearch` | Search code across repositories      |

### Suppression Rules

Suppress known noise with glob patterns and text matching:

```json
{
  "suppress": {
    "files": ["generated/**", "vendor/**", "*.min.js"],
    "patterns": ["TODO", "FIXME"]
  }
}
```

**File patterns** use glob syntax: `*` matches within a directory, `**` matches across directories, `?` matches a single character.

**Text patterns** do case-insensitive substring matching against issue titles and messages.

#### `.openlensignore` File

Alternatively, create a `.openlensignore` file in your project root (one pattern per line, `#` for comments):

```
# Auto-generated code
generated/**
vendor/**

# Test fixtures
test/fixtures/**

# Minified assets
*.min.js
*.min.css
```

---

## 4. Agents

Agents are the core of OpenLens. Each agent is a specialist reviewer with its own prompt, model configuration, and tool permissions.

### Built-in Agents

OpenLens ships with four agents, copied to your `agents/` directory on `openlens init`:

| Agent         | Focus                                  |
| ------------- | -------------------------------------- |
| `security`    | Vulnerabilities, secrets, auth flaws, injection attacks |
| `bugs`        | Logic errors, null checks, race conditions, resource leaks |
| `performance` | N+1 queries, memory leaks, caching, algorithm complexity |
| `style`       | Naming conventions, dead code, consistency with codebase |

### Agent File Format

Agents are markdown files with YAML frontmatter. The frontmatter configures behavior; the markdown body is the review prompt.

Every effective agent follows a consistent structure — what we call the **review methodology pattern**. This is the same pattern used by all four built-in agents:

1. **Role declaration** — who the agent is and what tools it has
2. **How to review** — step-by-step tool usage methodology (the critical part)
3. **What to look for** — specific, actionable criteria
4. **What NOT to flag** — reduces false positives by setting clear boundaries
5. **Output format** — JSON schema for structured results

Here's a complete custom agent example following this pattern:

```markdown
---
description: Accessibility checker
mode: subagent
model: anthropic/claude-sonnet-4-20250514
steps: 5
permission:
  read: allow
  grep: allow
  glob: allow
  list: allow
  edit: deny
  bash: deny
---

You are an accessibility-focused code reviewer with access to the full codebase.

## How to review

1. Read the diff carefully to understand what changed
2. For each changed file, use `read` to view the full source for context
3. Use `grep` to check if similar accessibility patterns exist elsewhere (indicates systemic issues)
4. Use `glob` to find related component files, layout templates, and config files
5. Only report issues you can confirm by investigating the actual code

## What to look for

- Missing ARIA labels on interactive elements — read the component to check
- Insufficient color contrast ratios — check CSS/style values
- Missing alt text on images — grep for `<img` without `alt`
- Keyboard navigation issues — check for onClick without onKeyDown
- Screen reader compatibility — missing role attributes, live regions
- Focus management in modals and dialogs
- Form inputs without associated labels

## What NOT to flag

- Components in test files or storybook stories
- Accessibility issues in third-party/vendor code
- Theoretical issues you cannot confirm from the actual code
- Styling preferences that don't affect accessibility
- Issues in generated or minified files

## Output

Return a JSON array of issues:

\`\`\`json
[
  {
    "file": "src/Button.tsx",
    "line": 12,
    "severity": "warning",
    "title": "Missing aria-label on icon button",
    "message": "Icon-only buttons need an aria-label for screen readers. This button renders only an SVG icon with no visible text.",
    "fix": "Add aria-label=\"Close\" to the button element",
    "patch": "-<button onClick={onClose}>\n+<button onClick={onClose} aria-label=\"Close\">"
  }
]
\`\`\`

If no issues found, return `[]`
```

### The Review Methodology Pattern

The **"How to review"** section is the most important part of any agent. It teaches the AI *how to use its tools* to investigate code rather than guessing. The built-in agents all follow this generalized pattern:

| Step | Action | Why |
| ---- | ------ | --- |
| 1 | **Read the diff** | Understand what changed |
| 2 | **`read` full files** | Get surrounding context — the diff alone isn't enough |
| 3 | **`grep` for patterns** | Find callers, related code, systemic issues |
| 4 | **`glob` for related files** | Discover configs, related modules, test files |
| 5 | **Only report confirmed issues** | Eliminate false positives — if you can't prove it, don't flag it |

This methodology is what separates a high-quality agent from a noisy one. Without it, agents tend to hallucinate issues based on the diff alone. With it, they investigate the actual codebase and only report what they can verify.

### Writing Effective "What NOT to Flag" Rules

The "What NOT to flag" section is equally critical. It sets boundaries that prevent the agent from drifting into another agent's territory or reporting noise:

- **Stay in your lane**: A security agent should not flag style issues. A performance agent should not flag bugs.
- **Require evidence**: "Theoretical vulnerabilities requiring unrealistic conditions" — forces the agent to ground findings in reality.
- **Exclude noise sources**: Test files, generated code, vendor directories, startup-only code.
- **Respect project context**: Issues that match existing codebase patterns are intentional, not bugs.

### Agent Configuration Fields

| Field            | Type                                   | Default      | Description                         |
| ---------------- | -------------------------------------- | ------------ | ----------------------------------- |
| `description`    | string                                 | —            | Human-readable description          |
| `mode`           | `"subagent"` \| `"primary"` \| `"all"` | `"subagent"` | When/how the agent runs             |
| `model`          | string                                 | Global model | Provider/model-id override          |
| `prompt`         | string                                 | —            | Inline text or `{file:./path.md}`   |
| `steps`          | number                                 | `5`          | Max agentic loop iterations         |
| `disable`        | boolean                                | `false`      | Turn off without deleting           |
| `hidden`         | boolean                                | `false`      | Hide from listings                  |
| `color`          | string                                 | —            | Hex color for terminal output       |
| `fullFileContext` | boolean                               | `true`       | Include full source of changed files|
| `permission`     | object                                 | Read-only    | Tool permissions for this agent     |

### Agent Modes

- **`subagent`** (default) — runs in parallel with other agents during a review
- **`primary`** — orchestrator agent that can delegate work to subagents via the `openlens-delegate` tool
- **`all`** — can act as either subagent or primary depending on context

When any `primary` agent exists, it orchestrates the review and subagents become available for delegation. Otherwise, all `subagent` agents run directly in parallel.

### Managing Agents via CLI

```bash
# List all agents and their status
openlens agent list

# Create a new agent scaffold
openlens agent create a11y --description "Accessibility checker"

# Test a single agent on current changes
openlens agent test security --staged

# Validate all agent and MCP configurations
openlens agent validate

# Disable/enable agents without deleting
openlens agent disable style
openlens agent enable style
```

### Disabling Agents

Three ways to disable an agent:

1. **CLI**: `openlens agent disable <name>`
2. **Frontmatter**: set `disable: true` in the agent's `.md` file
3. **Config**: add the agent name to `disabled_agents` array

```json
{
  "disabled_agents": ["style"]
}
```

### Issue Schema

Every agent must return issues in this JSON format:

```json
{
  "file": "src/auth.ts",
  "line": 42,
  "endLine": 45,
  "severity": "critical",
  "title": "SQL injection via unsanitized input",
  "message": "The username parameter is interpolated directly into the SQL query.",
  "fix": "Use a prepared statement with parameterized queries.",
  "patch": "-db.query(`SELECT * FROM users WHERE name = '${username}'`)\n+db.query('SELECT * FROM users WHERE name = $1', [username])"
}
```

| Field      | Required | Description                            |
| ---------- | -------- | -------------------------------------- |
| `file`     | yes      | Relative file path                     |
| `line`     | yes      | Starting line number (1-indexed)       |
| `endLine`  | no       | Ending line number                     |
| `severity` | yes      | `"critical"`, `"warning"`, or `"info"` |
| `title`    | yes      | Short issue headline                   |
| `message`  | yes      | Detailed explanation                   |
| `fix`      | no       | How to fix the issue                   |
| `patch`    | no       | Suggested code change (unified diff)   |

### Verification Pass

When `verify: true` (the default), OpenLens runs a second pass after all agents complete. A verifier agent re-examines every flagged issue against the actual code to filter out false positives. Only confirmed issues make it to the final output.

Disable verification for faster (but noisier) results:

```bash
openlens run --no-verify
```

---

## 5. Skills

OpenLens is built on [OpenCode](https://github.com/anomalyco/opencode), which includes a **skills** system. Skills are reusable instruction sets that agents can discover and load on-demand, keeping context efficient through lazy-loading.

While OpenLens focuses on its agent-based review system, skills from the underlying OpenCode platform are available and can extend agent capabilities.

### What Are Skills?

Skills are markdown files (`SKILL.md`) with YAML frontmatter that define reusable behaviors. Unlike agents (which are always-running reviewers), skills are loaded on-demand when an agent determines it needs specialized knowledge.

### Skill File Format

Each skill lives in its own directory with a `SKILL.md` file:

```markdown
---
name: react-review
description: React-specific code review patterns including hooks rules, component lifecycle, and performance anti-patterns
---

## React Review Patterns

### Hooks Rules
- Hooks must be called at the top level, never inside conditions or loops
- Custom hooks must start with `use`
- Dependencies arrays must be complete

### Performance Anti-patterns
- Inline object/array creation in JSX props causes unnecessary re-renders
- Missing `useMemo`/`useCallback` for expensive computations passed as props
- Components re-rendering due to unstable references

### Common Mistakes
- Using `useEffect` for derived state (use `useMemo` instead)
- Missing cleanup functions in effects with subscriptions
- Stale closures from missing dependency array entries
```

**Required frontmatter fields:**

| Field         | Description                                            |
| ------------- | ------------------------------------------------------ |
| `name`        | 1–64 chars, lowercase alphanumeric with hyphens        |
| `description` | 1–1024 chars, guides agent selection (be specific)     |

The `name` must match the directory name and follow the pattern `^[a-z0-9]+(-[a-z0-9]+)*$`.

### Skill Discovery Locations

OpenCode discovers skills from these directories (searched in order):

| Location | Scope |
| -------- | ----- |
| `.opencode/skills/<name>/SKILL.md` | Project |
| `~/.config/opencode/skills/<name>/SKILL.md` | Global |
| `.claude/skills/<name>/SKILL.md` | Project (Claude-compatible) |
| `~/.claude/skills/<name>/SKILL.md` | Global (Claude-compatible) |
| `.agents/skills/<name>/SKILL.md` | Project (agent-compatible) |
| `~/.agents/skills/<name>/SKILL.md` | Global (agent-compatible) |

For project paths, OpenCode walks up from your working directory to the git worktree root, loading all matching definitions.

### Skill Permissions

Control which skills are available via pattern-based rules in your OpenCode config:

```json
{
  "permission": {
    "skill": {
      "*": "allow",
      "internal-*": "deny",
      "experimental-*": "ask"
    }
  }
}
```

| Permission | Behavior |
| ---------- | -------- |
| `allow`    | Immediate access |
| `deny`     | Hidden from agents |
| `ask`      | Requires user approval |

### How Agents Use Skills

Agents invoke skills via the `skill` tool:

```
skill({ name: "react-review" })
```

The agent sees available skills listed in the tool description and loads them when relevant. This lazy-loading keeps the context window efficient — agents only pull in the knowledge they need.

### Skills vs. Agents

| Aspect | Agents | Skills |
| ------ | ------ | ------ |
| **When they run** | Always active during review | Loaded on-demand by agents |
| **Context cost** | Full prompt always in context | Lazy-loaded, minimal cost until used |
| **Autonomy** | Runs independently, produces issues | Provides knowledge to the invoking agent |
| **Output** | Structured JSON issue array | Instructions/knowledge (no fixed format) |
| **Best for** | Review domains (security, bugs, etc.) | Domain knowledge, project conventions, language patterns |

### Disabling Skills

Disable the skill tool entirely for specific agents:

```yaml
---
description: My agent
tools:
  skill: false
---
```

---

## 6. CLI Reference

### Commands Overview

```
openlens run                     Run code review
openlens init                    Initialize in current project
openlens agent list              List configured agents
openlens agent create <name>     Create a new review agent
openlens agent test <name>       Test a single agent on current changes
openlens agent validate          Validate all agent configurations
openlens agent enable <name>     Re-enable a disabled agent
openlens agent disable <name>    Disable an agent
openlens serve                   Start HTTP server
openlens models                  List available models from OpenCode
openlens doctor                  Check environment and configuration
```

### `openlens run`

Run a code review against your git changes.

| Flag                 | Short | Description                                 |
| -------------------- | ----- | ------------------------------------------- |
| `--staged`           |       | Review staged changes                       |
| `--unstaged`         |       | Review unstaged changes                     |
| `--branch <name>`    |       | Review diff against a branch (default: main)|
| `--agents <list>`    |       | Comma-separated agent whitelist             |
| `--exclude-agents <list>` |  | Comma-separated agents to skip              |
| `--model <id>`       | `-m`  | Override model for all agents               |
| `--format <fmt>`     | `-f`  | Output format: `text`, `json`, `sarif`      |
| `--no-verify`        |       | Skip the verification pass                  |
| `--no-context`       |       | Skip full file context (diff only)          |
| `--dry-run`          |       | Show what would run without API calls       |

**Examples:**

```bash
# Standard staged review
openlens run --staged

# Security-only review with SARIF output
openlens run --agents security --format sarif > results.sarif

# Use a different model
openlens run -m openai/gpt-4o

# Fast review without verification or full context
openlens run --no-verify --no-context
```

### `openlens init`

Scaffold OpenLens in the current project. Creates `openlens.json` and the `agents/` directory with four built-in agent templates. Idempotent — won't overwrite existing files.

### `openlens agent create <name>`

Generate a new agent scaffold.

| Flag              | Description                                          |
| ----------------- | ---------------------------------------------------- |
| `--description`   | Agent description                                    |
| `--model`         | Model override (e.g. `anthropic/claude-sonnet-4-20250514`) |
| `--steps`         | Max agentic loop iterations (default: 5)             |

```bash
openlens agent create a11y --description "Accessibility checker" --steps 3
```

### `openlens agent test <name>`

Test a single agent against your current changes. Useful for developing and debugging custom agents.

| Flag              | Short | Description                              |
| ----------------- | ----- | ---------------------------------------- |
| `--staged`        |       | Review staged changes                    |
| `--unstaged`      |       | Review unstaged changes                  |
| `--branch <name>` |       | Review diff against branch               |
| `--model <id>`    | `-m`  | Override model                           |
| `--format <fmt>`  |       | Output format: `text`, `json`            |
| `--verbose`       |       | Show timing and metadata (default: true) |

```bash
openlens agent test security --staged --verbose
```

### `openlens agent validate`

Check all agent and MCP configurations for errors. Reports missing files, invalid frontmatter, and broken MCP connections.

### `openlens agent list`

Display all configured agents with their description, model, mode, and enabled/disabled status.

### `openlens serve`

Start the HTTP server for programmatic access.

| Flag         | Description                                 |
| ------------ | ------------------------------------------- |
| `--port`     | Server port (default: from config, or 4096) |
| `--hostname` | Bind address (default: localhost)            |

### `openlens models`

List all models available through the OpenCode, along with the currently configured default model.

### `openlens doctor`

Run a comprehensive environment check: git, OpenCode binary, API keys, config file, agent configs, MCP servers, and CI detection.

### Exit Codes

| Code | Meaning                  |
| ---- | ------------------------ |
| `0`  | No critical issues found |
| `1`  | Critical issues detected |
| `2`  | Runtime error            |

---

## 7. Output Formats & SARIF

OpenLens supports four output formats, selected with `--format` or `-f`.

### Text (default)

Colorized console output with severity indicators, file locations, and suggested fixes. Grouped by severity (critical first). Respects the `NO_COLOR` environment variable for plain text output.

```bash
openlens run --format text
```

### JSON

Full structured output including issues, timing, and metadata. Ideal for scripting and programmatic consumption.

```bash
openlens run --format json
```

**Example output:**

```json
{
  "issues": [
    {
      "file": "src/auth.ts",
      "line": 42,
      "severity": "critical",
      "agent": "security",
      "title": "SQL injection via unsanitized input",
      "message": "The username parameter is interpolated directly into the SQL query.",
      "fix": "Use a prepared statement.",
      "patch": "-db.query(`SELECT * FROM users WHERE name = '${username}'`)\n+db.query('SELECT * FROM users WHERE name = $1', [username])"
    }
  ],
  "timing": {
    "security": 4200,
    "bugs": 3800
  },
  "meta": {
    "mode": "staged",
    "filesChanged": 3,
    "agentsRun": 2,
    "agentsFailed": 0,
    "suppressed": 0,
    "verified": true
  }
}
```

### SARIF

[Static Analysis Results Interchange Format](https://sarifweb.azurewebsites.net/) v2.1.0. First-class integration with GitHub Code Scanning, GitLab SAST, and any SARIF-compatible tool.

```bash
openlens run --format sarif > results.sarif
```

**Severity mapping:**

| OpenLens   | SARIF       |
| ---------- | ----------- |
| `critical` | `error`     |
| `warning`  | `warning`   |
| `info`     | `note`      |

**SARIF features:**

- Tool driver identified as `openlens` with semantic versioning
- Rule IDs follow `openlens/<agent-name>` pattern (e.g. `openlens/security`)
- Results include file locations with line/endLine regions
- Fix suggestions included as `artifactChanges` when patches are available

### Markdown

GitHub-flavored Markdown output designed for PR comments and issue descriptions. Issues are grouped by file in collapsible `<details>` sections with severity badges, file links, suggested fixes, and diff patches.

```bash
openlens run --format markdown
```

When running in GitHub Actions (with `GITHUB_REPOSITORY` and `GITHUB_SHA` set), file references become clickable permalinks to the exact lines on GitHub.

**Features:**

- `<!-- openlens-review -->` marker for automated comment updates (avoids duplicate comments)
- Severity summary table with issue counts
- Collapsible file sections with per-issue detail
- GitHub permalink generation when repo/SHA context is available
- Suggested fixes in blockquotes and patches as `diff` code blocks
- Automatic truncation for large reviews (GitHub's 65K character limit)

**Options (library API):**

```typescript
formatMarkdown(result, {
  repo: "owner/repo",   // for GitHub permalink generation
  sha: "abc123",        // commit SHA for permalinks
})
```

---

## 8. HTTP Server API

OpenLens includes a built-in HTTP server for programmatic access and integration with other tools.

### Starting the Server

```bash
openlens serve                          # default: localhost:4096
openlens serve --port 8080              # custom port
openlens serve --hostname 0.0.0.0       # bind to all interfaces
```

The server uses the [Hono](https://hono.dev/) framework and supports both Node.js and Bun runtimes.

### Endpoints

#### `GET /health`

Health check.

```bash
curl http://localhost:4096/health
```

```json
{ "status": "ok" }
```

#### `GET /`

Version information.

```json
{ "name": "openlens", "version": "0.1.0" }
```

#### `POST /review`

Run a code review. All fields are optional.

```bash
curl -X POST http://localhost:4096/review \
  -H "Content-Type: application/json" \
  -d '{
    "agents": ["security", "bugs"],
    "mode": "staged",
    "branch": "main",
    "verify": true,
    "fullFileContext": true
  }'
```

**Request body:**

| Field            | Type     | Default   | Description                 |
| ---------------- | -------- | --------- | --------------------------- |
| `agents`         | string[] | all       | Agent whitelist             |
| `mode`           | string   | config    | staged, unstaged, branch, auto |
| `branch`         | string   | `"main"`  | Base branch for branch mode |
| `verify`         | boolean  | `true`    | Run verification pass       |
| `fullFileContext` | boolean | `true`    | Include full file sources   |

**Response:** Full `ReviewResult` JSON (same as `--format json`).

#### `GET /agents`

List all configured agents with their name, description, model, mode, steps, and permissions.

#### `GET /config`

Current configuration with sensitive data stripped (MCP server commands, args, and environment variables are redacted).

#### `GET /diff`

Diff statistics for the current repository state.

```bash
curl "http://localhost:4096/diff?mode=staged"
```

```json
{
  "mode": "staged",
  "stats": {
    "filesChanged": 2,
    "insertions": 10,
    "deletions": 5,
    "files": ["src/auth.ts", "src/config.ts"]
  }
}
```

---

## 9. CI/CD Integration

OpenLens is designed for CI/CD pipelines. It auto-detects CI environments and adjusts defaults accordingly.

### Auto-detected CI Systems

| CI System      | Detection Variable                   | Default Mode |
| -------------- | ------------------------------------ | ------------ |
| GitHub Actions | `GITHUB_ACTIONS=true`                | `branch`     |
| GitLab CI      | `GITLAB_CI=true`                     | `branch`     |
| CircleCI       | `CIRCLECI=true`                      | `branch`     |
| Buildkite      | `BUILDKITE=true`                     | `branch`     |
| Jenkins        | `JENKINS_URL` set                    | `branch`     |
| Travis CI      | `TRAVIS=true`                        | `branch`     |

### Auto-detected Base Branches

In CI, OpenLens infers the base branch from environment variables:

- **GitHub Actions**: `GITHUB_BASE_REF` (set on pull request events)
- **GitLab CI**: `CI_MERGE_REQUEST_TARGET_BRANCH_NAME` (set on merge requests)
- **Buildkite**: `BUILDKITE_PULL_REQUEST_BASE_BRANCH`

### GitHub Actions

#### Using the Composite Action (Recommended)

OpenLens ships with a ready-to-use GitHub Action (`action.yml`) that handles setup, review, SARIF upload, and optional PR commenting:

```yaml
name: OpenLens Code Review
on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write
  security-events: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: Traves-Theberge/OpenLens@main
        with:
          mode: branch
          base-branch: ${{ github.base_ref }}
          comment-on-pr: "true"
          upload-sarif: "true"
          fail-on-critical: "true"
```

> **Provider setup:** OpenLens uses [OpenCode](https://github.com/anomalyco/opencode) for model access. Configure your provider by either:
> - Setting a secret as an env var (e.g. `ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}`)
> - Passing it via the `anthropic-api-key` or `openai-api-key` inputs
> - Committing an `opencode.json` config file to your repo (see [OpenCode docs](https://github.com/anomalyco/opencode))
>
> Any provider OpenCode supports works — Anthropic, OpenAI, Google, Groq, AWS Bedrock, Azure OpenAI, GitHub Copilot, and more.

**Action inputs:**

| Input              | Default    | Description                                    |
|--------------------|------------|------------------------------------------------|
| `mode`             | `branch`   | Review mode: `staged`, `unstaged`, `branch`, `auto` |
| `agents`           | all        | Comma-separated agent names                    |
| `format`           | `sarif`    | Output format: `text`, `json`, `sarif`, `markdown` |
| `base-branch`      | `main`     | Base branch for branch mode diff               |
| `verify`           | `true`     | Run verification pass                          |
| `config`           |            | Path to `openlens.json` config file            |
| `upload-sarif`     | `true`     | Upload SARIF to GitHub Code Scanning           |
| `fail-on-critical` | `true`     | Fail workflow on critical issues               |
| `comment-on-pr`    | `false`    | Post review results as a PR comment            |
| `model`            |            | Override model (e.g. `anthropic/claude-sonnet-4-20250514`) |
| `anthropic-api-key`|            | Anthropic API key (optional — or set env var)  |
| `openai-api-key`   |            | OpenAI API key (optional — or set env var)     |

**Action outputs:**

| Output       | Description                        |
|--------------|------------------------------------|
| `issues`     | Number of issues found             |
| `critical`   | Number of critical issues found    |
| `sarif-file` | Path to SARIF output file          |

**PR Comments:**

When `comment-on-pr: "true"` is set, OpenLens posts a formatted review comment on the pull request. On subsequent pushes, the existing comment is **updated** instead of creating a new one (using a hidden `<!-- openlens-review -->` marker). The comment includes:

- Severity summary table
- Issues grouped by file in collapsible sections
- Clickable permalinks to the exact lines on GitHub
- Suggested fixes and diff patches

> **Note:** PR commenting requires `pull-requests: write` permission and only works on `pull_request` events.

#### Manual Setup

If you prefer not to use the composite action:

```yaml
name: OpenLens Code Review
on: [pull_request]

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: oven-sh/setup-bun@v2

      - name: Install OpenLens
        run: |
          git clone https://github.com/Traves-Theberge/OpenLens.git /tmp/openlens
          cd /tmp/openlens && bun install && bun run build && bun link

      - name: Run review
        run: openlens run --branch ${{ github.base_ref }} --format text
        env:
          ANTHROPIC_API_KEY: ${{ secrets.ANTHROPIC_API_KEY }}  # or any OpenCode-supported provider key
```

### GitLab CI

```yaml
openlens-review:
  stage: test
  image: oven/bun:latest
  script:
    - git clone https://github.com/Traves-Theberge/OpenLens.git /tmp/openlens
    - cd /tmp/openlens && bun install && bun run build && bun link
    - cd $CI_PROJECT_DIR
    - openlens run --format text
  variables:
    ANTHROPIC_API_KEY: $ANTHROPIC_API_KEY  # or any OpenCode-supported provider key
  rules:
    - if: $CI_MERGE_REQUEST_ID
```

### Fail on Critical Issues

OpenLens exits with code `1` when critical issues are found. Use this in CI to gate merges:

```bash
openlens run --branch main --format text
# Exit code 0 = clean, 1 = critical issues found
```

### CI Tips

- Use `--no-verify` for faster CI runs if you're gating on critical issues only
- Use `--agents security` for security-focused gates
- Use `--format sarif` for rich GitHub/GitLab integration
- Set `--no-context` to reduce token usage (trades accuracy for speed)
- The `--branch` flag is automatically inferred in supported CI systems

---

## 10. Library & Plugin API

### Using OpenLens as a Library

Import OpenLens functions directly into your TypeScript/JavaScript project:

```typescript
import {
  runReview,
  loadConfig,
  loadAgents,
  getDiff,
  formatSarif,
  formatJson,
  formatText,
  formatMarkdown,
} from "openlens"

// Load config and run a review
const config = await loadConfig()
const result = await runReview(config, "staged")

// Format output
console.log(formatText(result))       // colorized text
console.log(formatJson(result))       // structured JSON
console.log(formatSarif(result))      // SARIF v2.1.0
console.log(formatMarkdown(result))   // GitHub Markdown
```

### Library Exports

**Core functions:**

| Export                  | Description                          |
| ----------------------- | ------------------------------------ |
| `runReview`             | Run a full multi-agent review        |
| `runSingleAgentReview`  | Run review with a single agent       |
| `loadConfig`            | Load and merge configuration         |
| `loadInstructions`      | Load project instruction files       |
| `discoverRules`         | Discover rules files (AGENTS.md, CLAUDE.md, globs) |
| `formatDiscoveredRules` | Format discovered rules as markdown  |
| `loadAgents`            | Load and resolve agent configs       |
| `filterAgents`          | Whitelist agents by name             |
| `excludeAgents`         | Exclude agents by name               |
| `getDiff`               | Get diff from git (by mode)          |
| `getAutoDetectedDiff`   | Auto-detect diff mode                |
| `getDiffStats`          | Parse diff statistics                |
| `formatText`            | Format results as colored text       |
| `formatJson`            | Format results as JSON               |
| `formatSarif`           | Format results as SARIF              |
| `formatMarkdown`        | Format results as GitHub Markdown    |
| `loadSuppressRules`     | Load suppression rules from config   |
| `shouldSuppress`        | Check if an issue should be suppressed |
| `createBus`             | Create a new event bus instance      |
| `bus`                   | Default shared event bus             |
| `createServer`          | Create the HTTP server               |
| `detectCI`              | Detect CI environment                |
| `resolveOpencodeBin`    | Resolve OpenCode binary path         |
| `inferBaseBranch`       | Infer base branch from CI env        |

**Type exports:**

| Type           | Description              |
| -------------- | ------------------------ |
| `Issue`        | Issue schema             |
| `ReviewResult` | Review result schema     |
| `Config`       | Configuration schema     |
| `AgentConfig`  | Agent config schema      |
| `Agent`        | Resolved agent type      |
| `ReviewEvents` | Event bus event types    |
| `SuppressRule` | Suppression rule type    |
| `MarkdownOptions` | Markdown formatter options |
| `RulesDiscoveryConfig` | Rules discovery options |
| `DiscoveredRule` | Discovered rules file metadata |

### Custom Review Pipeline

```typescript
import {
  loadConfig,
  loadAgents,
  filterAgents,
  getDiff,
  runReview,
  loadSuppressRules,
  shouldSuppress,
  bus,
} from "openlens"

// Listen for events
bus.subscribe("agent.completed", ({ name, issueCount, time }) => {
  console.log(`${name}: ${issueCount} issues in ${time}ms`)
})

// Load and customize
const config = await loadConfig()
const agents = await loadAgents(config)
const selected = filterAgents(agents, ["security", "bugs"])

// Run
const result = await runReview(config, "branch")

// Post-process
const rules = loadSuppressRules(config)
const filtered = result.issues.filter((issue) => !shouldSuppress(issue, rules))

console.log(`${filtered.length} issues after suppression`)
```

### OpenCode Plugin

OpenLens can run as a plugin inside [OpenCode](https://github.com/anomalyco/opencode) sessions, making review tools available to the AI assistant.

**Enable in your OpenCode config:**

```json
{
  "plugin": ["openlens"]
}
```

**Registered tools:**

| Tool                   | Description                     |
| ---------------------- | ------------------------------- |
| `openlens`             | Run a full review               |
| `openlens-delegate`    | Delegate to a specialist agent  |
| `openlens-conventions` | Get project review instructions |
| `openlens-agents`      | List available agents           |

**Plugin behavior:**

- Auto-approves read-only tools (`read`, `grep`, `glob`, `list`) for OpenLens sessions
- Sets temperature to `0` (deterministic) for review sessions
- Sessions are named with `openlens-` prefix for identification

---

## 11. Advanced Topics

### Event Bus

Subscribe to review lifecycle events for monitoring, logging, or custom integrations.

```typescript
import { createBus, bus } from "openlens"

// Use the default shared bus
bus.subscribe("review.started", ({ agents }) => {
  console.log(`Review starting with agents: ${agents.join(", ")}`)
})

bus.subscribe("agent.started", ({ name }) => {
  console.log(`Agent ${name} started`)
})

bus.subscribe("agent.completed", ({ name, issueCount, time }) => {
  console.log(`Agent ${name}: ${issueCount} issues in ${time}ms`)
})

bus.subscribe("agent.failed", ({ name, error }) => {
  console.error(`Agent ${name} failed: ${error}`)
})

bus.subscribe("review.completed", ({ issueCount, time }) => {
  console.log(`Review complete: ${issueCount} issues in ${time}ms`)
})
```

**Event reference:**

| Event               | Data                                              |
| ------------------- | ------------------------------------------------- |
| `review.started`    | `{ agents: string[] }`                            |
| `agent.started`     | `{ name: string }`                                |
| `agent.completed`   | `{ name: string, issueCount: number, time: number }` |
| `agent.failed`      | `{ name: string, error: string }`                 |
| `review.completed`  | `{ issueCount: number, time: number }`            |

**Event lifecycle:**

1. `review.started` fires once
2. For each agent (in parallel batches): `agent.started` → `agent.completed` or `agent.failed`
3. If verification is enabled: `agent.started/completed` for the `"verifier"` agent
4. `review.completed` fires once

**Custom event bus:**

```typescript
import { createBus } from "openlens"

type MyEvents = {
  "deploy.started": { env: string }
  "deploy.completed": { env: string; duration: number }
}

const myBus = createBus<MyEvents>()
myBus.subscribe("deploy.started", handler)
myBus.publish("deploy.started", { env: "staging" })
```

### MCP (Model Context Protocol)

Extend agent capabilities by connecting MCP servers. These provide additional tools that agents can use during reviews.

**Local MCP server:**

```json
{
  "mcp": {
    "my-linter": {
      "type": "local",
      "command": "path/to/mcp-server",
      "args": ["--strict"],
      "environment": {
        "API_KEY": "your-key"
      },
      "enabled": true
    }
  }
}
```

**Remote MCP server:**

```json
{
  "mcp": {
    "remote-analysis": {
      "type": "remote",
      "url": "http://localhost:3001",
      "enabled": true
    }
  }
}
```

**Key behaviors:**

- MCP tools are automatically available to agents (unless explicitly denied via permissions)
- Connection failures are non-fatal — the review continues without the MCP tools
- Validate connectivity with `openlens agent validate` or `openlens doctor`
- Use `enabled: false` to temporarily disable an MCP server without removing its config

### Review Instructions & Rules Discovery

OpenLens has two ways to provide project-specific guidance to review agents:

1. **Automatic rules discovery** — walks your directory tree for well-known files
2. **Explicit instruction files** — configured in `openlens.json`

Both are combined and injected into every agent's context. Discovered rules are loaded first, then explicit instruction files, so explicit files take highest priority.

#### Automatic Rules Discovery

OpenLens automatically discovers rules files by walking from your working directory up to the repository root. This follows the same convention used by OpenCode and Claude Code (`AGENTS.md`, `CLAUDE.md`).

**Well-known files** (discovered automatically):

| File | Purpose |
| ---- | ------- |
| `AGENTS.md` | OpenCode-style agent instructions — conventions, architecture notes, review focus areas |
| `CLAUDE.md` | Claude Code-style project rules — coding standards, patterns to follow/avoid |
| `.openlens/rules.md` | OpenLens-specific rules |

**How directory walking works:**

Files are discovered from the repo root down to your working directory. Deeper files are appended last, giving them higher priority (they can override or refine root-level rules).

```
my-project/              ← repo root
├── AGENTS.md            ← loaded first (project-wide rules)
├── CLAUDE.md            ← loaded second
├── packages/
│   └── api/
│       ├── AGENTS.md    ← loaded later (package-specific overrides)
│       └── src/
│           └── ...      ← if cwd is here, all above files are discovered
```

**Example `AGENTS.md`:**

```markdown
# Review Instructions

## Project Context
This is a Next.js application with a PostgreSQL backend.

## Known Patterns
- We use `zod` for all input validation
- Database queries go through the `db/` layer, never raw SQL
- All API routes require authentication middleware

## Ignore
- The `legacy/` directory is being deprecated, don't flag issues there
- `console.log` statements in `scripts/` are intentional
```

#### Configuring Rules Discovery

Customize discovery behavior in `openlens.json`:

```json
{
  "review": {
    "rules": {
      "enabled": true,
      "extraFiles": ["REVIEW_RULES.md", ".github/review.md"],
      "include": [".openlens/rules/*.md", "docs/review-rules/**/*.md"],
      "exclude": ["**/drafts/**"],
      "maxDepth": 20
    }
  }
}
```

| Option | Type | Default | Description |
| ------ | ---- | ------- | ----------- |
| `enabled` | boolean | `true` | Enable automatic directory-walking discovery |
| `extraFiles` | string[] | `[]` | Additional file names to discover (walked like well-known files) |
| `include` | string[] | `[]` | Glob patterns for rules files (resolved from repo root) |
| `exclude` | string[] | `[]` | Glob patterns to exclude from discovery |
| `maxDepth` | number | `20` | Maximum directories to walk up from cwd |

To disable automatic discovery entirely and only use explicit instruction files:

```json
{
  "review": {
    "rules": { "enabled": false },
    "instructions": ["REVIEW.md"]
  }
}
```

#### Explicit Instruction Files

In addition to (or instead of) auto-discovery, you can list specific files in the `instructions` array:

```json
{
  "review": {
    "instructions": ["REVIEW.md", "docs/CODING_STANDARDS.md"]
  }
}
```

These are loaded after discovered rules, so they have the highest priority.

### Full File Context

When `fullFileContext: true` (the default), OpenLens includes the complete source of every changed file in each agent's prompt. This allows agents to understand the surrounding code, not just the diff.

- Files over 500 lines are truncated with a note
- Disable per-agent with `fullFileContext: false` in the agent config
- Disable globally with `--no-context` flag or in config

This improves accuracy but increases token usage. For cost-sensitive CI pipelines, consider disabling it.

### Concurrency and Timeouts

**Concurrency** controls how many agents run in parallel:

```json
{
  "review": {
    "maxConcurrency": 4
  }
}
```

Agents are batched — if you have 6 agents with `maxConcurrency: 4`, the first 4 run together, then the remaining 2.

**Timeout** is per-agent, not per-review:

```json
{
  "review": {
    "timeoutMs": 180000
  }
}
```

If an agent exceeds the timeout, it fails with an `agent.failed` event and the review continues with remaining agents.

---

## 12. Troubleshooting

### `openlens doctor`

Always start here. This command validates your entire setup:

```bash
openlens doctor
```

It checks:
- Git is installed and the current directory is a repository
- OpenCode binary is found and executable
- A model provider is configured (via env vars or OpenCode config)
- `openlens.json` parses without errors
- All agent prompt files exist and have valid frontmatter
- MCP servers are reachable
- CI environment variables (if applicable)

### Common Issues

**"No diff found"**

OpenLens couldn't find any changes to review. Make sure you have:
- Staged changes (`git add`) when using `--staged`
- Uncommitted changes when using `--unstaged`
- Commits ahead of the base branch when using `--branch`

```bash
# Check what OpenLens sees
git diff --cached --stat          # staged
git diff --stat                   # unstaged
git diff main...HEAD --stat       # branch
```

**"OpenCode binary not found"**

OpenLens requires the OpenCode binary. Either:
- Install OpenCode globally
- Set `OPENCODE_BIN` to the explicit path

**"API key not set"**

Configure a model provider via environment variable or OpenCode config file:

```bash
# Option 1: Environment variable (any supported provider)
export ANTHROPIC_API_KEY="sk-ant-..."    # Anthropic
export OPENAI_API_KEY="sk-..."           # OpenAI
export GEMINI_API_KEY="..."              # Google Gemini
export GROQ_API_KEY="..."               # Groq

# Option 2: OpenCode config file (opencode.json) or use `opencode /connect`
# See https://github.com/anomalyco/opencode for full provider list
```

**Agent timeout**

If agents are timing out, try:
- Increasing `review.timeoutMs` in config
- Using `--no-context` to reduce prompt size
- Using a faster model (`--model`)
- Reducing agent `steps` count

**Too many false positives**

- Ensure `verify: true` is set (verification pass filters false positives)
- Add project-specific guidance in `AGENTS.md`, `CLAUDE.md`, or `REVIEW.md`
- Tune agent prompts in the `agents/` directory
- Use suppression rules for known noise

**High token usage**

- Use `--no-context` to skip full file inclusion
- Run fewer agents (`--agents security,bugs`)
- Lower `maxConcurrency` to reduce parallel API calls
- Use `--no-verify` to skip the verification pass

### Architecture Reference

```
src/
├── index.ts              # CLI entry point (yargs)
├── lib.ts                # Public library exports
├── plugin.ts             # OpenCode plugin integration
├── types.ts              # Zod schemas & types
├── env.ts                # CI detection & binary resolution
├── suppress.ts           # Suppression rules
├── agent/
│   └── agent.ts          # Agent loading & config merging
├── bus/
│   └── index.ts          # Event bus
├── config/
│   ├── schema.ts         # Zod config schema
│   ├── config.ts         # Config resolution (layered)
│   └── rules.ts          # Rules discovery (AGENTS.md, CLAUDE.md, globs)
├── session/
│   └── review.ts         # Review orchestration & verification
├── server/
│   └── server.ts         # Hono HTTP server
├── output/
│   └── format.ts         # Text/JSON/SARIF formatters
└── tool/
    └── diff.ts           # Git diff collection

agents/                   # Built-in agent prompts
├── security.md
├── bugs.md
├── performance.md
└── style.md
```

---

## License

MIT — see [LICENSE](LICENSE).
