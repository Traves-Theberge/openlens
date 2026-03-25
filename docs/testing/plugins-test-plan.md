# Plugins Test Plan

Test plan for validating OpenLens platform plugins (Claude Code, Codex CLI, Gemini CLI).

---

## 1. Claude Code Plugin (`plugins/claude-code/openlens.md`)

### Installation

```bash
# Option A: Symlink from repo
ln -s /path/to/OpenLens/plugins/claude-code/ ~/.claude/skills/openlens/

# Option B: Copy from npm package
cp -r node_modules/openlens/plugins/claude-code/ ~/.claude/skills/openlens/
```

### Validation

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 1.1 | Skill file has valid YAML frontmatter | `name: openlens`, `description: Run OpenLens AI code review on current changes` | |
| 1.2 | `/openlens` in Claude Code | Triggers the skill, runs `openlens run --staged --format text` | |
| 1.3 | `/openlens --unstaged` | Passes `--unstaged` flag to CLI | |
| 1.4 | `/openlens --branch main` | Passes `--branch main` to CLI | |
| 1.5 | `/openlens --agents security,bugs` | Passes `--agents` filter | |
| 1.6 | `/openlens --no-verify` | Skips verification pass | |
| 1.7 | Results shown to user | Full text output displayed, issues listed | |
| 1.8 | `openlens` binary available | Claude Code can find and execute `openlens` in PATH | |

### Frontmatter Validation

```bash
# Quick check — parse YAML frontmatter
head -4 plugins/claude-code/openlens.md
# Should show:
# ---
# name: openlens
# description: Run OpenLens AI code review on current changes
# ---
```

---

## 2. Codex CLI Plugin (`plugins/codex/`)

### File Validation

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 2.1 | `plugin.json` is valid JSON | Parses without error | |
| 2.2 | `plugin.json` has correct structure | `name`, `description`, `tools` array | |
| 2.3 | `tools[0].name` | `"openlens-review"` | |
| 2.4 | `tools[0].parameters` | Has `mode`, `agents`, `branch` params | |
| 2.5 | `tools.ts` compiles | `bun build plugins/codex/tools.ts --outdir /tmp` succeeds | |

### Functional Tests

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 2.6 | `openlensReview({})` | Runs `openlens run --staged --format json`, returns JSON string | |
| 2.7 | `openlensReview({ mode: "unstaged" })` | Passes `--unstaged` flag | |
| 2.8 | `openlensReview({ mode: "branch", branch: "main" })` | Passes `--branch main` | |
| 2.9 | `openlensReview({ agents: "security" })` | Passes `--agents security` | |
| 2.10 | Error handling | Returns JSON with `error` field on failure, doesn't throw | |

### Quick Validation

```bash
# Validate plugin.json
python3 -m json.tool plugins/codex/plugin.json > /dev/null && echo "VALID" || echo "INVALID"

# Compile check
bun build plugins/codex/tools.ts --outdir /tmp 2>&1 | tail -1
```

---

## 3. Gemini CLI Plugin (`plugins/gemini/`)

### File Validation

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 3.1 | `tool.ts` compiles | `bun build plugins/gemini/tool.ts --outdir /tmp` succeeds | |
| 3.2 | Exports `review` function | Function signature matches `(params: { mode?, agents?, branch? }) => string` | |

### Functional Tests

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 3.3 | `review({})` | Runs `openlens run --staged --format json`, returns JSON string | |
| 3.4 | `review({ mode: "unstaged" })` | Passes `--unstaged` flag | |
| 3.5 | `review({ mode: "branch", branch: "main" })` | Passes `--branch main` | |
| 3.6 | `review({ agents: "security" })` | Passes `--agents security` | |
| 3.7 | Error handling | Returns JSON with `error` field on failure, doesn't throw | |

### Quick Validation

```bash
bun build plugins/gemini/tool.ts --outdir /tmp 2>&1 | tail -1
```

---

## 4. Cross-Plugin Consistency

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 4.1 | All plugins produce same JSON output | Same `openlens run --format json` result regardless of caller | |
| 4.2 | All plugins handle empty diff | Return valid JSON with empty issues array | |
| 4.3 | All plugins respect `--agents` filtering | Same agent filtering behavior | |
| 4.4 | All plugins handle missing `openlens` binary | Graceful error, not a crash | |

---

## 5. Package Distribution

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 5.1 | `plugins/` in package.json `files` array | Yes — plugins included in npm package | |
| 5.2 | `npm pack --dry-run` | Lists `plugins/claude-code/openlens.md`, `plugins/codex/*`, `plugins/gemini/*` | |
| 5.3 | After `npm install openlens` | Plugins available at `node_modules/openlens/plugins/` | |

### Quick Validation

```bash
# Check package includes plugins
grep -q '"plugins"' package.json && echo "INCLUDED" || echo "MISSING"

# Dry run pack
bun pm pack --dry-run 2>&1 | grep plugins
```
