# OpenLens CLI Test Plan

Manual and automated test plan for validating every CLI command and flag. Run this after any changes to `src/index.ts`, agent loading, config resolution, or output formatting.

---

## Prerequisites

```bash
bun install
bun run build
bun link        # ensures `openlens` is available globally
```

---

## 1. Global Flags

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 1.1 | `openlens -v` | Prints current version (e.g. `0.1.1`) | |
| 1.2 | `openlens --version` | Same as above | |
| 1.3 | `openlens -h` | Full help with description, quick start, commands, examples | |
| 1.4 | `openlens --help` | Same as above | |
| 1.5 | `openlens` (no command) | Shows help + "Please specify a command" (exit 1) | |
| 1.6 | `openlens bogus` | "Unknown argument: bogus" (exit 1) | |

---

## 2. `openlens doctor`

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 2.1 | `openlens doctor` | Checks git, opencode, API keys, config, agents. "All checks passed." (exit 0) | |
| 2.2 | `openlens doctor` (outside git repo, e.g. `/tmp`) | Still shows git/opencode checks, config may warn | |

---

## 3. `openlens models`

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 3.1 | `openlens models` | Shows "Current model:" + list of available models | |

---

## 4. `openlens init`

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 4.1 | `openlens init` (fresh project) | Creates `openlens.json` + `agents/*.md` for 4 agents | |
| 4.2 | `openlens init` (already initialized) | "exists" for all files, no overwrites (idempotent) | |

---

## 5. `openlens run` — Dry Run (no API calls)

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 5.1 | `openlens run --dry-run --staged` | Shows mode: staged, lists agents, "No changes to review" if clean | |
| 5.2 | `openlens run --dry-run --unstaged` | Shows mode: unstaged | |
| 5.3 | `openlens run --dry-run --branch main` | Shows mode: branch | |
| 5.4 | `openlens run --dry-run --agents security,bugs` | Only 2 agents listed | |
| 5.5 | `openlens run --dry-run --exclude-agents style` | 3 agents (style excluded) | |
| 5.6 | `openlens run --dry-run -m opencode/gpt-5-nano` | All agents show overridden model | |
| 5.7 | `openlens run --dry-run --no-verify` | verify: false | |
| 5.8 | `openlens run --dry-run --no-context` | context: diff only | |
| 5.9 | `openlens run --dry-run --format sarif` | output: sarif | |
| 5.10 | `openlens run --dry-run --format markdown` | output: markdown | |

---

## 6. `openlens run` — Live Review

Requires staged/unstaged changes. Stage a test file first:
```bash
echo 'eval(userInput)' > /tmp/test.js && git add /tmp/test.js
```
Or use an existing dirty working tree.

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 6.1 | `openlens run --staged --agents security --no-verify --no-context` | Progress streaming (thinking/tool/step), issues found, text output | |
| 6.2 | `openlens run --staged --format json --no-verify` | Valid JSON with `issues`, `timing`, `meta` | |
| 6.3 | `openlens run --staged --format sarif --no-verify` | Valid SARIF v2.1.0 with `version`, `runs`, `results` | |
| 6.4 | `openlens run --staged --format markdown --no-verify` | GitHub-flavored markdown with `<!-- openlens-review -->` marker | |
| 6.5 | `openlens run --staged` (empty diff) | "No issues found (0 files, 0 agents)" (exit 0) | |
| 6.6 | `openlens run --staged` (with `--verify`) | Verification pass runs after agents | |
| 6.7 | `openlens run` (outside git repo) | Error: "Not a git repository" (exit 2) | |

### Confidence scoring (v2)

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 6.8 | `openlens run --staged --format json` | Issues include `confidence` field | |
| 6.9 | `openlens run --staged --format sarif` | SARIF results have `rank` (10.0/50.0/90.0) and `properties.confidence` | |

---

## 7. `openlens agent list`

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 7.1 | `openlens agent list` | Shows all agents with model, mode, allowed tools, steps | |

---

## 8. `openlens agent validate`

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 8.1 | `openlens agent validate` | All agents pass with model, steps, tools count | |

---

## 9. `openlens agent create`

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 9.1 | `openlens agent create test-agent` | Creates `agents/test-agent.md` + updates `openlens.json` | |
| 9.2 | `openlens agent create test-agent --description "Test" --model opencode/gpt-5-nano --steps 3` | Agent file has correct model/steps in frontmatter | |
| 9.3 | `openlens agent create security` | Error: "already exists" (exit 2) | |
| 9.4 | `openlens agent create "BAD NAME"` | Error: "must be lowercase alphanumeric with hyphens" (exit 2) | |

Clean up after: `rm agents/test-agent.md` and remove from `openlens.json`.

---

## 10. `openlens agent disable / enable`

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 10.1 | `openlens agent disable style` | "style disabled" | |
| 10.2 | `openlens agent list` (after disable) | style should not appear or show as disabled | |
| 10.3 | `openlens agent enable style` | "style enabled" | |
| 10.4 | `openlens agent disable nonexistent` | Error: "not found in config" (exit 2) | |
| 10.5 | `openlens agent enable nonexistent` | Error: "not found in config" (exit 2) | |

---

## 11. `openlens agent test`

Requires staged changes.

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 11.1 | `openlens agent test security --staged` | Runs single agent with progress, shows verbose metadata | |
| 11.2 | `openlens agent test security --staged --format json` | Valid JSON output | |
| 11.3 | `openlens agent test security --staged --no-verbose` | No metadata header, just results | |
| 11.4 | `openlens agent test security --staged -m opencode/gpt-5-nano` | Uses overridden model | |
| 11.5 | `openlens agent test nonexistent --staged` | Error: "not found. Available: ..." (exit 2) | |

---

## 12. `openlens serve`

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 12.1 | `openlens serve --port 5555` | "listening on http://localhost:5555" | |
| 12.2 | `curl localhost:5555/` | `{"name":"openlens","version":"0.1.1"}` | |
| 12.3 | `curl localhost:5555/health` | `{"status":"ok"}` | |
| 12.4 | `curl localhost:5555/agents` | JSON array of 4 agents | |
| 12.5 | `curl localhost:5555/config` | JSON config (secrets redacted) | |
| 12.6 | `openlens serve --port 5555 --hostname 0.0.0.0` | Binds to all interfaces | |

Kill server after testing.

---

## 13. Automated Test Suite

```bash
bun run typecheck          # No type errors
bun test                   # All 217+ tests pass
bun run build              # Compiles to dist/
```

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 13.1 | `bun run typecheck` | Exit 0, no errors | |
| 13.2 | `bun test` | 217+ pass, 0 fail | |
| 13.3 | `bun run build` | Clean compilation to `dist/` | |
