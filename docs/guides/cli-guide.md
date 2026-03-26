# OpenLens CLI Guide

Practical workflows for using OpenLens from the command line. For reference docs, see the [README](../../README.md) and [USER_GUIDE](../../USER_GUIDE.md).

---

## Installation & Setup

### Install from source

```bash
git clone https://github.com/Traves-Theberge/OpenLens.git
cd OpenLens
bun install
bun run build
bun link
```

This makes the `openlens` command available globally.

### Verify your environment

```bash
openlens doctor
```

This checks for git, the opencode binary, API keys, config validity, and agent health. Fix anything marked with a red X before proceeding.

API keys are optional -- free models (like `opencode/big-pickle`) work without them.

### Initialize a project

```bash
cd your-project
openlens init
```

This creates:
- `openlens.json` -- project config
- `agents/` -- directory with four default agents: security, bugs, performance, style

---

## Your First Review

### Stage some changes and run

```bash
git add -p                    # stage the changes you want reviewed
openlens run --staged
```

### Reading the output

In text mode (the default), you'll see a live progress stream:

```
  OpenLens  Reviewing staged changes (4 agents)...

  ● security  reviewing...
    → security  read src/auth.ts
    ◆ security  step 2/5
  ✓ security  1 issues (3.2s)
  ✓ bugs  0 issues (2.8s)
  ✓ performance  0 issues (1.9s)
  ✓ style  2 issues (2.1s)
```

Each issue includes:
- **Severity**: `critical`, `warning`, or `info`
- **Confidence**: `high`, `medium`, or `low` -- how certain the agent is
- **File and line**: exact location in your code
- **Fix suggestion**: what to change, sometimes with a patch

The process exits with code 1 if any critical issues are found, 0 otherwise. This makes it usable in CI gates.

### What each default agent does

| Agent | Focus |
|-------|-------|
| **security** | SQL injection, XSS, auth flaws, hardcoded secrets, path traversal, SSRF |
| **bugs** | Logic errors, off-by-ones, null derefs, race conditions |
| **performance** | N+1 queries, unnecessary allocations, blocking calls |
| **style** | Naming conventions, code organization, consistency |

---

## Common Workflows

### Pre-commit review

Review exactly what you're about to commit:

```bash
git add -p
openlens run --staged
git commit
```

### PR review (full branch diff)

See everything that changed on your branch compared to main:

```bash
openlens run --branch main
```

### Quick security check

Run only the security agent, skip the verification pass for speed:

```bash
openlens run --agents security --no-verify
```

### Preview what would run (no API calls)

```bash
openlens run --dry-run
```

Output shows the diff mode, files changed, which agents will run, their models, step counts, and tool permissions.

### Run specific agents, exclude others

```bash
# Only security and bugs:
openlens run --agents security,bugs --staged

# Everything except style:
openlens run --exclude-agents style --staged
```

### Override the model for a single run

```bash
openlens run --staged -m anthropic/claude-sonnet-4-20250514
```

This overrides the model for all agents in that run.

### Output formats

```bash
# Human-readable (default):
openlens run --staged

# Machine-readable JSON:
openlens run --staged -f json

# SARIF for GitHub Code Scanning:
openlens run --staged -f sarif

# Markdown for PR comments:
openlens run --staged -f markdown
```

When to use each:
- **text** -- interactive use, reading in a terminal
- **json** -- piping to `jq`, scripting, custom tooling
- **sarif** -- uploading to GitHub Code Scanning via `codeql/upload-sarif`
- **markdown** -- posting as a PR comment in CI

---

## Working with Agents

### List configured agents

```bash
openlens agent list
```

Shows each agent's model, mode, allowed tools, and step count.

### Test a single agent

Iterate on an agent's prompt without running the full suite:

```bash
openlens agent test security --staged
openlens agent test bugs --branch main
openlens agent test performance --staged -f json
```

The test command shows verbose output (timing, model, tools) by default.

### Create a custom agent

```bash
openlens agent create api-review --description "API design reviewer" --steps 5
```

This does two things:
1. Creates `agents/api-review.md` with a prompt template and frontmatter
2. Adds the agent entry to `openlens.json`

Then edit `agents/api-review.md` to define what it should look for.

### Agent prompt structure

Agent files are Markdown with YAML frontmatter:

```markdown
---
description: Security vulnerability scanner
context: security
mode: subagent
model: opencode/big-pickle
steps: 5
permission:
  read: allow
  grep: allow
  glob: allow
  list: allow
  edit: deny
  write: deny
  bash: deny
---

You are a security-focused code reviewer...
```

**Frontmatter fields:**
- `description` -- shown in `agent list` output
- `context` -- categorization hint for the agent
- `mode` -- `subagent` (runs in parallel), `primary`, or `all`
- `model` -- which AI model to use
- `steps` -- max agentic loop iterations (more steps = deeper investigation, slower)
- `permission` -- which tools the agent can use (`allow`/`deny`)

### Validate all agents

Check for misconfigurations (missing prompts, bad model names, no tools):

```bash
openlens agent validate
```

### Enable and disable agents

```bash
openlens agent disable style     # skip style checks for now
openlens agent enable style      # bring it back
```

Disabled agents won't run during `openlens run`.

---

## Configuration

### Project config: `openlens.json`

```json
{
  "$schema": "https://openlens.dev/config.json",
  "model": "opencode/big-pickle",
  "agent": {
    "security": {
      "description": "Security vulnerability scanner",
      "prompt": "{file:./agents/security.md}"
    }
  },
  "review": {
    "defaultMode": "staged",
    "instructions": ["REVIEW.md"],
    "fullFileContext": true,
    "verify": true
  }
}
```

Key settings:
- `model` -- default model for all agents (agents can override in their frontmatter)
- `review.defaultMode` -- what `openlens run` uses when no `--staged`/`--branch` flag is given
- `review.fullFileContext` -- when true, agents see full files, not just diffs
- `review.verify` -- when true, a verification pass filters false positives
- `review.instructions` -- extra files to include as review context

### Confidence threshold

```json
{
  "review": {
    "minConfidence": "high"
  }
}
```

Options: `high`, `medium` (default), `low`. Setting to `high` suppresses medium/low confidence findings.

### Suppression rules

Create `.openlensignore` in your project root to suppress specific findings. Works like `.gitignore` but for review results.

You can also add suppression patterns in the config.

### Environment variables

| Variable | Effect |
|----------|--------|
| `OPENLENS_MODEL` | Override model for all agents (same as `--model` flag) |
| `OPENLENS_PORT` | Override server port (same as `--port` flag) |
| `ANTHROPIC_API_KEY` | Required for Anthropic models |
| `OPENAI_API_KEY` | Required for OpenAI models |
| `NO_COLOR` | Disable colored output |

---

## HTTP Server

### Start the server

```bash
openlens serve --port 5555
```

Default port is 4096 if not specified in config or flags.

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/review` | Run a review |
| GET | `/agents` | List configured agents |
| GET | `/config` | Show current config |
| GET | `/diff` | Get the current diff |
| GET | `/health` | Health check |

### Example: trigger a review via curl

```bash
curl -s -X POST http://localhost:5555/review \
  -H "Content-Type: application/json" \
  -d '{"mode": "staged"}' | jq .
```

### Example: list agents

```bash
curl -s http://localhost:5555/agents | jq '.[] | .name'
```

### Example: health check

```bash
curl -s http://localhost:5555/health
```

---

## Tips & Tricks

**Faster reviews (less accurate):**
```bash
openlens run --staged --no-context --no-verify
```
`--no-context` sends only the diff (not full files). `--no-verify` skips the false-positive filter. Both reduce API calls.

**Filter JSON output with jq:**
```bash
# Only critical issues:
openlens run --staged -f json | jq '.issues[] | select(.severity == "critical")'

# Count issues per agent:
openlens run --staged -f json | jq '.issues | group_by(.agent) | map({agent: .[0].agent, count: length})'
```

**Clean output for logs:**
```bash
NO_COLOR=1 openlens run --staged
```

**List available models:**
```bash
openlens models
```

**Git hooks (recommended):**
```bash
openlens hooks install
```

This installs two hooks:

- **`pre-commit`** — reviews staged changes with security+bugs agents (~15s), blocks on critical issues
- **`pre-push`** — reviews full branch diff with all agents (~60s), blocks on critical issues

Skip hooks for a single operation:

```bash
OPENLENS_SKIP=1 git commit -m "wip"
```

Remove hooks (restores backed-up originals):

```bash
openlens hooks remove
```

For global hooks across all repos:

```bash
git config --global core.hooksPath ~/.config/openlens/hooks
```

Install is idempotent and backs up existing hooks.

**CI usage with SARIF:**
```bash
openlens run --branch main -f sarif > results.sarif
# Then upload with github/codeql-action/upload-sarif
```
