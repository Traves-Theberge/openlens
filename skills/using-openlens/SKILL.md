---
name: using-openlens
description: Guide for using openlens to review code. Triggers on: "review my code", "check for bugs", "security scan", "run openlens", "set up code review", "openlens".
---

## What openlens is

openlens is an AI code review tool. It runs four agents (security, bugs, performance, style) in parallel against git diffs. Each agent reads the full codebase, not just the diff. Results include file, line, severity, confidence, and suggested fixes.

## When to use which command

**Someone asks you to review code:**
```bash
openlens run --staged          # if they have staged changes
openlens run --unstaged        # if they have uncommitted changes
openlens run --branch main     # if they want to review a full branch
```

Pick based on what they have. If unsure, `--staged` is the default. Add `--no-verify` for speed (skips the false-positive filter).

**Someone asks for a quick security check:**
```bash
openlens run --staged --agents security --no-verify --no-context
```
Fast. Only runs the security agent. No full file context, no verification pass.

**Someone wants to test a single agent they're building:**
```bash
openlens agent test my-agent --staged --verbose
```

**Someone wants to set up openlens in their project:**
```bash
openlens setup        # interactive wizard: config, agents, hooks, plugins, CI/CD
openlens setup --yes  # accept all defaults, no prompts
```

**Someone wants a dry run (no API calls):**
```bash
openlens run --dry-run --staged
```
Shows which agents would run, which files changed, what settings are active. No model calls.

## How to read the output

Each issue has:
- **severity**: `critical` (must fix), `warning` (should fix), `info` (suggestion)
- **confidence**: `high`, `medium`, `low` (how sure the agent is)
- **file:line**: exact location
- **title**: one-line summary
- **message**: detailed explanation
- **fix**: how to resolve it
- **patch**: suggested diff (if available)

**Exit codes matter:**
- `0` = no critical issues (or no issues at all)
- `1` = critical issues found
- `2` = runtime error (openlens itself failed)

## What to do when issues are found

1. Show the user the full output
2. For critical issues: offer to fix them. Use the `fix` field and `patch` field as guidance
3. For warnings: mention them but don't block. Ask if the user wants to address them
4. For info: note them briefly. These are style suggestions, not problems

If the output includes a `patch` field, you can apply that diff directly.

## Output formats

```bash
openlens run --staged --format text      # human-readable (default)
openlens run --staged --format json      # structured, for programmatic use
openlens run --staged --format sarif     # for GitHub Code Scanning upload
openlens run --staged --format markdown  # for PR comments
```

Use `--format json` when you need to parse the results. Use `--format text` when showing to the user.

## Setting up a new project

Full interactive setup (config, agents, hooks, plugins, CI/CD):
```bash
openlens setup
```

Or individual pieces:
```bash
openlens setup --config    # just openlens.json + model selection
openlens setup --agents    # enable/disable/create agents
openlens setup --hooks     # install git pre-commit + pre-push hooks
openlens setup --plugins   # install Claude Code/Codex/Gemini plugins
openlens setup --ci        # generate GitHub Actions or GitLab CI workflow
```

## Managing agents

```bash
openlens agent list                          # see what's configured
openlens agent validate                      # check for config errors
openlens agent create api-review             # scaffold a new agent
openlens agent test security --staged        # test one agent in isolation
openlens agent disable performance           # turn off without deleting
openlens agent enable performance            # turn back on
```

Agents are markdown files in `agents/`. Edit the markdown to change what the agent looks for.

## Hooks

Git hooks block commits/pushes with critical issues:
```bash
openlens hooks install    # adds pre-commit + pre-push
openlens hooks remove     # restores originals
```

Skip when needed:
```bash
OPENLENS_SKIP=1 git commit -m "wip"
OPENLENS_AGENTS=security git commit -m "fix"   # only run security agent
```

## Checking the environment

```bash
openlens doctor    # verifies git, opencode binary, config, agents
```

Run this first if something isn't working.

## Common patterns

**Pre-commit review (fast):**
```bash
openlens run --staged --agents security,bugs --no-verify
```

**Full branch review before PR:**
```bash
openlens run --branch main
```

**CI pipeline:**
```bash
openlens run --branch $BASE_BRANCH --format sarif > results.sarif
```

**Check if setup is correct:**
```bash
openlens doctor && openlens agent validate
```
