# OpenLens

AI-powered code review for your terminal. OpenLens runs specialized agents in parallel to catch security vulnerabilities, bugs, performance issues, and style violations before they land.

## Overview

OpenLens is a TypeScript CLI tool that orchestrates multiple AI review agents against your git diffs. Each agent has read-only access to your full codebase, enabling deep analysis that goes beyond surface-level pattern matching. Built on the [OpenCode SDK](https://github.com/opencode-ai/opencode), it supports any model provider OpenCode supports.

## Features

- **Parallel Agent Execution**: Run security, bug, performance, and style agents concurrently
- **Full Codebase Access**: Agents can read, grep, and glob your project — not just the diff
- **Multiple AI Providers**: Any model supported by OpenCode (Anthropic, OpenAI, Google, AWS Bedrock, Groq, and more)
- **SARIF Output**: First-class CI/CD integration with GitHub Actions, GitLab CI, and other tools
- **Verification Pass**: Built-in false positive filter that re-examines flagged issues
- **Suppression Rules**: Glob patterns and `.openlensignore` to silence known noise
- **Customizable Agents**: Write your own review agents with markdown prompts and YAML frontmatter
- **Library & Plugin API**: Use as a CLI, HTTP server, library import, or OpenCode plugin
- **Event Bus**: Subscribe to review lifecycle events for custom integrations

## Installation

```bash
# Clone and install
git clone https://github.com/Traves-Theberge/OpenLens.git
cd OpenLens
bun install
```

### Running

```bash
# Direct
bun run src/index.ts run

# Or build and link globally
bun run build
bun link
openlens run
```

## Quick Start

```bash
# Initialize OpenLens in your project
openlens init

# Review staged changes
openlens run --staged

# Review against main branch
openlens run --branch main

# Run only security and bug agents
openlens run --agents security,bugs

# Preview what would run
openlens run --dry-run

# Output SARIF for CI
openlens run --format sarif > results.sarif
```

## Configuration

OpenLens looks for configuration in these locations (last wins):

1. Built-in defaults
2. `~/.config/openlens/openlens.json` (global)
3. `./openlens.json` or `./openlens.jsonc` (project root)
4. Environment variables (`OPENLENS_MODEL`, `OPENLENS_PORT`)
5. CI environment defaults (auto-detected)

### Configuration File Structure

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
      "permission": {
        "read": "allow",
        "grep": "allow",
        "glob": "allow",
        "list": "allow",
        "edit": "deny",
        "bash": "deny"
      }
    },
    "bugs": {
      "description": "Bug and logic error detector",
      "mode": "subagent",
      "prompt": "{file:./agents/bugs.md}",
      "steps": 5
    },
    "performance": {
      "description": "Performance issue finder",
      "mode": "subagent",
      "prompt": "{file:./agents/performance.md}",
      "steps": 5
    },
    "style": {
      "description": "Style and convention checker",
      "mode": "subagent",
      "prompt": "{file:./agents/style.md}",
      "steps": 3
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
    "maxConcurrency": 4
  },

  "suppress": {
    "files": ["generated/**", "vendor/**"],
    "patterns": []
  },

  "server": {
    "port": 4096,
    "hostname": "localhost"
  },

  "mcp": {},

  "disabled_agents": []
}
```

### Permission System

Permissions control what tools each agent can use. Three values are supported:

| Value     | Behavior                        |
| --------- | ------------------------------- |
| `"allow"` | Tool executes without approval  |
| `"deny"`  | Tool is blocked                 |
| `"ask"`   | Requires user confirmation      |

Permissions are inherited in layers (last wins):

1. Built-in defaults (read-only codebase access)
2. Global `permission` block in config
3. YAML frontmatter in the agent's `.md` file
4. Agent-specific `permission` in config

#### Granular Patterns

For fine-grained control, use pattern matching on tools like `bash`:

```json
{
  "permission": {
    "bash": {
      "git *": "allow",
      "rm *": "deny",
      "*": "ask"
    }
  }
}
```

### Available Tools

| Tool          | Description                          |
| ------------- | ------------------------------------ |
| `read`        | Read file contents                   |
| `edit`        | Modify files                         |
| `glob`        | Find files by pattern                |
| `grep`        | Search file contents                 |
| `list`        | List directory contents              |
| `bash`        | Execute shell commands               |
| `webfetch`    | Fetch data from URLs                 |
| `websearch`   | Search the web                       |
| `task`        | Run sub-tasks with an agent          |
| `codesearch`  | Search code across repositories      |

### Review Options

| Option              | Type     | Default        | Description                                   |
| ------------------- | -------- | -------------- | --------------------------------------------- |
| `defaultMode`       | string   | `"staged"`     | Default diff mode: staged, unstaged, branch, auto |
| `instructions`      | string[] | `["REVIEW.md"]`| Files with project-specific review guidance    |
| `baseBranch`        | string   | `"main"`       | Base branch for branch-mode diffs              |
| `fullFileContext`    | boolean  | `true`         | Include full source of changed files           |
| `verify`            | boolean  | `true`         | Run verification pass to filter false positives|
| `timeoutMs`         | number   | `180000`       | Timeout per agent in milliseconds              |
| `maxConcurrency`    | number   | `4`            | Max agents running in parallel                 |

### Suppression

Suppress known noise with glob patterns and text matching:

```json
{
  "suppress": {
    "files": ["generated/**", "vendor/**", "*.min.js"],
    "patterns": ["TODO", "FIXME"]
  }
}
```

Or use a `.openlensignore` file (one pattern per line, `#` for comments):

```
generated/**
vendor/**
# Ignore test fixtures
test/fixtures/**
```

## Agents

OpenLens ships with four built-in agents. Each is a markdown file with YAML frontmatter in the `agents/` directory.

### Built-in Agents

| Agent           | Focus                      | Default Model                          |
| --------------- | -------------------------- | -------------------------------------- |
| `security`      | Vulnerabilities & secrets  | `anthropic/claude-sonnet-4-20250514`   |
| `bugs`          | Logic errors & edge cases  | `anthropic/claude-sonnet-4-20250514`   |
| `performance`   | N+1 queries, bottlenecks   | `anthropic/claude-sonnet-4-20250514`   |
| `style`         | Conventions & dead code    | `anthropic/claude-sonnet-4-20250514`   |

### Creating Custom Agents

Create a markdown file in `agents/` with YAML frontmatter:

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

You are an accessibility-focused code reviewer.

## What to look for

- Missing ARIA labels on interactive elements
- Insufficient color contrast ratios
- Missing alt text on images
- Keyboard navigation issues
- Screen reader compatibility

## Output

Return a JSON array of issues:

\`\`\`json
[
  {
    "file": "src/Button.tsx",
    "line": 12,
    "severity": "warning",
    "title": "Missing aria-label on icon button",
    "message": "Icon-only buttons need an aria-label for screen readers.",
    "fix": "Add aria-label=\"Close\" to the button element"
  }
]
\`\`\`

If no issues found, return `[]`
```

Then reference it in your config:

```json
{
  "agent": {
    "a11y": {
      "description": "Accessibility checker",
      "prompt": "{file:./agents/a11y.md}"
    }
  }
}
```

Or use `openlens agent create`:

```bash
openlens agent create a11y --description "Accessibility checker"
```

### Agent Configuration Fields

| Field          | Type                                   | Default       | Description                          |
| -------------- | -------------------------------------- | ------------- | ------------------------------------ |
| `description`  | string                                 | —             | Human-readable description           |
| `mode`         | `"primary"` \| `"subagent"` \| `"all"` | `"subagent"` | When the agent can run               |
| `model`        | string                                 | Global model  | Provider/model-id (e.g. `anthropic/claude-sonnet-4-20250514`) |
| `prompt`       | string                                 | —             | Inline text or `{file:./path.md}`    |
| `steps`        | number                                 | `5`           | Max agentic loop iterations          |
| `temperature`  | number                                 | —             | Sampling temperature (0–1)           |
| `top_p`        | number                                 | —             | Nucleus sampling (0–1)               |
| `disable`      | boolean                                | `false`       | Turn off without deleting            |
| `hidden`       | boolean                                | `false`       | Hide from listings (subagents only)  |
| `color`        | string                                 | —             | Hex color or theme name              |
| `permission`   | object                                 | Read-only     | Tool permissions for this agent      |

## CLI Reference

### Commands

```
openlens run                    Run code review
openlens init                   Initialize in current project
openlens agent list             List configured agents
openlens agent create <name>    Create a new review agent
openlens agent test <name>      Test a single agent on current changes
openlens agent validate         Validate all agent configurations
openlens agent enable <name>    Re-enable a disabled agent
openlens agent disable <name>   Disable an agent
openlens serve                  Start HTTP server
openlens models                 List available models from OpenCode
openlens doctor                 Check environment and configuration
```

### `openlens run`

| Flag               | Short | Description                                      |
| ------------------ | ----- | ------------------------------------------------ |
| `--staged`         |       | Review staged changes                            |
| `--unstaged`       |       | Review unstaged changes                          |
| `--branch <name>`  |       | Review diff against a branch (default: main)     |
| `--agents <list>`  |       | Comma-separated agent whitelist                  |
| `--exclude-agents` |       | Comma-separated agents to skip                   |
| `--model <id>`     | `-m`  | Override model for all agents                    |
| `--format <fmt>`   | `-f`  | Output format: `text`, `json`, `sarif`           |
| `--no-verify`      |       | Skip the verification pass                       |
| `--no-context`     |       | Skip full file context (diff only)               |
| `--dry-run`        |       | Show what would run without making API calls      |

### `openlens agent create`

| Flag               | Description                                      |
| ------------------ | ------------------------------------------------ |
| `--description`    | Agent description                                |
| `--model`          | Model to use (e.g. `anthropic/claude-sonnet-4-20250514`) |
| `--steps`          | Max agentic loop iterations (default: 5)         |

### `openlens agent test`

| Flag               | Short | Description                                      |
| ------------------ | ----- | ------------------------------------------------ |
| `--staged`         |       | Review staged changes                            |
| `--unstaged`       |       | Review unstaged changes                          |
| `--branch <name>`  |       | Review diff against branch                       |
| `--model <id>`     | `-m`  | Override model                                   |
| `--format <fmt>`   |       | Output format: `text`, `json`                    |
| `--verbose`        |       | Show timing and metadata (default: true)         |

### `openlens serve`

| Flag            | Description                                      |
| --------------- | ------------------------------------------------ |
| `--port`        | Server port (default: from config, or 4096)      |
| `--hostname`    | Server hostname (default: localhost)              |

### `openlens doctor`

Validates your environment: git, OpenCode binary, API keys, config file, agent configurations, and CI detection. No flags needed.

### Exit Codes

| Code | Meaning                    |
| ---- | -------------------------- |
| `0`  | No critical issues found   |
| `1`  | Critical issues detected   |
| `2`  | Runtime error              |

## HTTP API

Start the server with `openlens serve`, then:

| Method | Endpoint    | Description                     |
| ------ | ----------- | ------------------------------- |
| `GET`  | `/`         | Version info                    |
| `POST` | `/review`   | Run a review                    |
| `GET`  | `/agents`   | List configured agents          |
| `GET`  | `/config`   | Current config (secrets stripped)|
| `GET`  | `/diff`     | Diff statistics                 |
| `GET`  | `/health`   | Health check                    |

### `POST /review`

```json
{
  "agents": ["security", "bugs"],
  "mode": "staged",
  "branch": "main",
  "verify": true,
  "fullFileContext": true
}
```

### Response

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

## Output Formats

### Text (default)

Colorized console output with severity indicators, file locations, and suggested fixes. Respects the `NO_COLOR` environment variable.

### JSON

Full structured output including issues, timing, and metadata. Suitable for programmatic consumption.

### SARIF

[Static Analysis Results Interchange Format](https://sarifweb.azurewebsites.net/) v2.1.0. Upload directly to GitHub Code Scanning, GitLab SAST, or any SARIF-compatible tool.

```bash
# GitHub Actions example
openlens run --format sarif > results.sarif
gh api repos/{owner}/{repo}/code-scanning/sarifs \
  --method POST \
  --field sarif=@results.sarif
```

## Library API

Use OpenLens programmatically:

```typescript
import { runReview, loadConfig, getDiff, formatSarif } from "openlens"

const config = await loadConfig()
const result = await runReview(config, "staged")

console.log(formatSarif(result))
```

### Exports

| Export                | Type       | Description                          |
| --------------------- | ---------- | ------------------------------------ |
| `runReview`           | function   | Run a full review                    |
| `runSingleAgentReview`| function   | Run a single agent review (delegation) |
| `loadConfig`          | function   | Load and validate config             |
| `loadInstructions`    | function   | Load project instruction files       |
| `loadAgents`          | function   | Load and resolve agent configs       |
| `filterAgents`        | function   | Whitelist agents by name             |
| `excludeAgents`       | function   | Exclude agents by name               |
| `getDiff`             | function   | Get diff from git                    |
| `getAutoDetectedDiff` | function   | Auto-detect diff mode                |
| `getDiffStats`        | function   | Parse diff statistics                |
| `formatText`          | function   | Format results as text               |
| `formatJson`          | function   | Format results as JSON               |
| `formatSarif`         | function   | Format results as SARIF              |
| `loadSuppressRules`   | function   | Load suppression rules               |
| `shouldSuppress`      | function   | Check if an issue should be suppressed|
| `createBus`           | function   | Create an event bus                  |
| `bus`                 | instance   | Default event bus                    |
| `createServer`        | function   | Create the HTTP server               |
| `detectCI`            | function   | Detect CI environment                |
| `resolveOpencodeBin`  | function   | Resolve OpenCode binary path         |
| `inferBaseBranch`     | function   | Infer base branch from CI env        |
| `Issue`               | type       | Issue schema                         |
| `ReviewResult`        | type       | Review result schema                 |
| `Config`              | type       | Configuration schema                 |
| `AgentConfig`         | type       | Agent config schema                  |
| `Agent`               | type       | Resolved agent type                  |
| `ReviewEvents`        | type       | Event bus event types                |
| `SuppressRule`        | type       | Suppression rule type                |

## OpenCode Plugin

OpenLens can run as an [OpenCode](https://opencode.ai/) plugin, making it available as a tool inside OpenCode sessions:

```json
{
  "plugin": ["openlens"]
}
```

This registers four tools:

| Tool                    | Description                          |
| ----------------------- | ------------------------------------ |
| `openlens`              | Run a full review                    |
| `openlens-delegate`     | Delegate to a specialist agent       |
| `openlens-conventions`  | Get project review instructions      |
| `openlens-agents`       | List available agents                |

## Event Bus

Subscribe to review lifecycle events for custom integrations:

```typescript
import { createBus } from "openlens"

const bus = createBus()

bus.subscribe("agent.started", ({ name }) => {
  console.log(`Agent ${name} started`)
})

bus.subscribe("agent.completed", ({ name, issueCount, time }) => {
  console.log(`Agent ${name} found ${issueCount} issues in ${time}ms`)
})

bus.subscribe("review.completed", ({ issueCount, time }) => {
  console.log(`Review complete: ${issueCount} issues in ${time}ms`)
})
```

### Events

| Event               | Data                                     |
| ------------------- | ---------------------------------------- |
| `review.started`    | `{ agents: string[] }`                   |
| `agent.started`     | `{ name: string }`                       |
| `agent.completed`   | `{ name: string, issueCount: number, time: number }` |
| `agent.failed`      | `{ name: string, error: string }`        |
| `review.completed`  | `{ issueCount: number, time: number }`   |

## MCP (Model Context Protocol)

OpenLens supports MCP servers for extending agent capabilities:

```json
{
  "mcp": {
    "example": {
      "type": "local",
      "command": "path/to/mcp-server",
      "args": ["--port", "3001"],
      "environment": {
        "API_KEY": "your-key"
      },
      "enabled": true
    }
  }
}
```

## Architecture

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
│   └── config.ts         # Config resolution (layered)
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

## Development

### Prerequisites

- [Bun](https://bun.sh/) 1.0+
- TypeScript 5.8+
- Node.js 18+ (if not using Bun)

### Building

```bash
git clone https://github.com/Traves-Theberge/OpenLens.git
cd OpenLens
bun install

# Development
bun run src/index.ts run --staged

# Build
bun run build

# Type check
bun run typecheck

# Test
bun test
```

## License

MIT — see [LICENSE](LICENSE).

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request
