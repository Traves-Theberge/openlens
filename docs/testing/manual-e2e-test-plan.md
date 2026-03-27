# openlens Manual End-to-End Test Plan

Run through this plan to validate the entire application works correctly. Tests are grouped by feature area and ordered by dependency.

---

## Prerequisites

```bash
openlens -v                    # should show current version
openlens doctor                # all checks should pass
bun test                       # all automated tests should pass
```

---

## 1. Setup Wizard

### 1.1 Fresh project setup
```bash
mkdir /tmp/e2e-test && cd /tmp/e2e-test
git init && git config user.email "t@t.com" && git config user.name "T"
echo "x" > README.md && git add . && git commit -m "init"
git remote add origin https://github.com/test/test.git
openlens setup --yes
```

| # | Check | Expected | Pass? |
|---|-------|----------|-------|
| 1.1.1 | openlens.json created | File exists with model, agent, review sections | |
| 1.1.2 | agents/ created | security.md, bugs.md, performance.md, style.md exist | |
| 1.1.3 | Git hooks installed | .git/hooks/pre-commit and pre-push exist, contain "openlens" | |
| 1.1.4 | Platform plugins detected | Claude Code, Codex, Gemini detected and configured (if installed) | |
| 1.1.5 | CI/CD workflow created | .github/workflows/openlens-review.yml exists (GitHub remote detected) | |
| 1.1.6 | using-openlens skill installed | ~/.claude/skills/using-openlens/SKILL.md exists (if Claude Code detected) | |

### 1.2 Individual setup sections
```bash
openlens setup --config --yes
openlens setup --agents --yes
openlens setup --hooks --yes
openlens setup --plugins --yes
openlens setup --ci --yes
```

| # | Check | Expected | Pass? |
|---|-------|----------|-------|
| 1.2.1 | --config only | Only openlens.json created | |
| 1.2.2 | --agents only | Only agents/*.md created | |
| 1.2.3 | --hooks only | Only .git/hooks/ created | |
| 1.2.4 | --plugins only | Only platform skills/hooks installed | |
| 1.2.5 | --ci only | Only .github/workflows/ created | |

Clean up: `rm -rf /tmp/e2e-test`

---

## 2. Code Review (the core feature)

### 2.1 Setup test repo with vulnerable code
```bash
mkdir /tmp/review-test && cd /tmp/review-test
git init && git config user.email "t@t.com" && git config user.name "T"
echo "x" > README.md && git add . && git commit -m "init"
openlens init
```

Create test file with known issues:
```bash
cat > app.js << 'EOF'
const API_KEY = "sk-ant-api03-REAL-SECRET-KEY-HERE"

function getUser(db, userId) {
  return db.query(`SELECT * FROM users WHERE id = ${userId}`)
}

function processInput(input) {
  return eval(input)
}

async function listUsers(db) {
  const users = await db.query("SELECT * FROM users")
  for (const user of users) {
    user.profile = await db.query(`SELECT * FROM profiles WHERE user_id = ${user.id}`)
  }
  return users
}

const cache = {}
function addToCache(key, value) {
  cache[key] = value
}
EOF
git add app.js
```

### 2.2 Review with each diff mode

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 2.2.1 | `openlens run --staged` | Finds issues in app.js, progress streaming visible | |
| 2.2.2 | `openlens run --staged --agents security` | Finds: hardcoded secret, SQL injection, eval | |
| 2.2.3 | `openlens run --staged --agents bugs` | Finds: potential null issues, error handling | |
| 2.2.4 | `openlens run --staged --agents performance` | Finds: N+1 query, unbounded cache | |
| 2.2.5 | `openlens run --staged --agents style` | Finds: naming, conventions | |

### 2.3 Review with all flags

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 2.3.1 | `openlens run --staged --no-verify` | Runs without verification pass (faster) | |
| 2.3.2 | `openlens run --staged --no-context` | Runs with diff only (no full file context) | |
| 2.3.3 | `openlens run --staged --format json` | Valid JSON output with issues array | |
| 2.3.4 | `openlens run --staged --format sarif` | Valid SARIF v2.1.0 | |
| 2.3.5 | `openlens run --staged --format markdown` | GitHub-flavored markdown with review marker | |
| 2.3.6 | `openlens run --staged -m opencode/gpt-5-nano` | Uses specified model | |
| 2.3.7 | `openlens run --staged --exclude-agents style` | Runs 3 agents (style excluded) | |
| 2.3.8 | `openlens run --dry-run --staged` | Shows plan without API calls | |

### 2.4 Review quality checks

| # | Check | Expected | Pass? |
|---|-------|----------|-------|
| 2.4.1 | Security finds hardcoded API key | CRITICAL severity, correct file:line | |
| 2.4.2 | Security finds SQL injection | CRITICAL severity, mentions parameterization in fix | |
| 2.4.3 | Security finds eval() | CRITICAL severity | |
| 2.4.4 | Performance finds N+1 query | WARNING severity, suggests batch query | |
| 2.4.5 | Issues have confidence field | Each issue has high/medium/low | |
| 2.4.6 | Severity format correct | Only critical/warning/info (not HIGH/ERROR/etc) | |
| 2.4.7 | No duplicate findings | Dedup removes same issue found by multiple agents | |
| 2.4.8 | Agent boundaries respected | Bugs doesn't report SQL injection, style doesn't report auth | |

### 2.5 Empty diff handling

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 2.5.1 | `openlens run --staged` (nothing staged) | "No issues found (0 files, 0 agents)" exit 0 | |
| 2.5.2 | `openlens run --staged --format json` (nothing staged) | `{"issues":[],...}` exit 0 | |

Clean up: `rm -rf /tmp/review-test`

---

## 3. Agent Management

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 3.1 | `openlens agent list` | Shows 4 agents with model, mode, tools, steps | |
| 3.2 | `openlens agent validate` | All 4 agents valid | |
| 3.3 | `openlens agent create test-agent --description "Test"` | Creates agents/test-agent.md + updates config | |
| 3.4 | `openlens agent create test-agent` | Error: "already exists" | |
| 3.5 | `openlens agent create "BAD NAME"` | Error: "lowercase alphanumeric" | |
| 3.6 | `openlens agent disable test-agent` | "test-agent disabled" | |
| 3.7 | `openlens agent enable test-agent` | "test-agent enabled" | |
| 3.8 | `openlens agent test security --staged` | Runs single agent with verbose output | |
| 3.9 | `openlens agent test nonexistent --staged` | Error: "not found. Available: ..." | |

Clean up: remove test-agent from openlens.json and agents/

---

## 4. Git Hooks

### 4.1 Install and remove

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 4.1.1 | `openlens hooks install` | Creates pre-commit + pre-push, shows confirmation | |
| 4.1.2 | `openlens hooks install` (again) | "exists" for both (idempotent) | |
| 4.1.3 | `openlens hooks remove` | Removes both, shows confirmation | |
| 4.1.4 | `openlens hooks remove` (again) | "skipped" for both (idempotent) | |

### 4.2 Hook blocking behavior

Setup:
```bash
openlens hooks install
echo 'eval(userInput)' > vuln.js && git add vuln.js
```

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 4.2.1 | `git commit -m "test"` | Hook runs, finds critical, BLOCKS commit (exit 1) | |
| 4.2.2 | `OPENLENS_SKIP=1 git commit -m "test"` | Hook skipped, commit succeeds | |
| 4.2.3 | `OPENLENS_AGENTS=security git commit -m "test"` | Only security agent runs | |

### 4.3 Hook with clean code

```bash
echo 'console.log("hello")' > clean.js && git add clean.js
```

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 4.3.1 | `git commit -m "clean"` | Hook runs, no critical issues, commit proceeds | |

---

## 5. HTTP Server

```bash
openlens serve --port 5555 &
```

| # | Endpoint | Expected | Pass? |
|---|----------|----------|-------|
| 5.1 | `curl localhost:5555/` | `{"name":"openlens","version":"0.2.3"}` | |
| 5.2 | `curl localhost:5555/health` | `{"status":"ok"}` | |
| 5.3 | `curl localhost:5555/agents` | JSON array of 4 agents | |
| 5.4 | `curl localhost:5555/config` | JSON config (secrets redacted) | |

Kill server after testing.

---

## 6. Docs Server

```bash
openlens docs --no-open &
```

| # | Check | Expected | Pass? |
|---|-------|----------|-------|
| 6.1 | `curl localhost:4200/1-overview` | HTML page with sidebar, content, TOC | |
| 6.2 | Mermaid diagrams | Render as SVG (not "Syntax error") | |
| 6.3 | Syntax highlighting | Code blocks have colored syntax | |
| 6.4 | Search | Type in search box, results appear | |
| 6.5 | Glossary page | Terms render as individual cards | |
| 6.6 | Sidebar order | 1-overview through 10-glossary in numeric order | |
| 6.7 | Diagram fullscreen | Click fullscreen button, SVG fills viewport, Esc closes | |

Kill server after testing.

---

## 7. Output Format Validation

Stage a file with issues, then test each format:

### 7.1 Text output
```bash
openlens run --staged --format text
```
| # | Check | Expected | Pass? |
|---|-------|----------|-------|
| 7.1.1 | Severity labels | CRITICAL/WARNING/INFO in output | |
| 7.1.2 | File locations | file:line shown for each issue | |
| 7.1.3 | Confidence shown | (medium confidence) or (low confidence) shown when not high | |
| 7.1.4 | Progress streaming | thinking.../tool calls/step done visible during review | |

### 7.2 JSON output
```bash
openlens run --staged --format json | python3 -m json.tool
```
| # | Check | Expected | Pass? |
|---|-------|----------|-------|
| 7.2.1 | Valid JSON | Parses without error | |
| 7.2.2 | Has issues array | Each issue has file, line, severity, confidence, title, message | |
| 7.2.3 | Has timing | Per-agent timing in milliseconds | |
| 7.2.4 | Has meta | mode, filesChanged, agentsRun, suppressed, verified | |

### 7.3 SARIF output
```bash
openlens run --staged --format sarif | python3 -m json.tool
```
| # | Check | Expected | Pass? |
|---|-------|----------|-------|
| 7.3.1 | Valid SARIF | version: "2.1.0", has runs array | |
| 7.3.2 | Tool info | driver.name: "openlens", driver.version matches | |
| 7.3.3 | Results mapped | Each issue appears as a result with location | |
| 7.3.4 | Confidence in properties | properties.confidence field present | |

### 7.4 Markdown output
```bash
openlens run --staged --format markdown
```
| # | Check | Expected | Pass? |
|---|-------|----------|-------|
| 7.4.1 | Review marker | Contains `<!-- openlens-review -->` | |
| 7.4.2 | Issues formatted | Severity, file, title, message in markdown | |

---

## 8. Platform Plugins

### 8.1 Claude Code
| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 8.1.1 | `/openlens` slash command | Runs review, shows results | |
| 8.1.2 | `/openlens --unstaged` | Passes flag through | |
| 8.1.3 | `using-openlens` skill loaded | Appears in skill list | |

### 8.2 OpenCode
| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 8.2.1 | `/openlens` in OpenCode | Runs review via native plugin | |

### 8.3 Gemini CLI
| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 8.3.1 | `/openlens` in Gemini | Runs review, shows summarized results | |

### 8.4 Codex CLI
| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 8.4.1 | `$openlens` in Codex | Runs review (may need --full-auto for network) | |

---

## 9. Error Handling

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 9.1 | `openlens run --staged` (outside git repo) | Error: "Not a git repository" (exit 2) | |
| 9.2 | `openlens run --format xml` | "Invalid values" (exit 1) | |
| 9.3 | `openlens bogus` | "Unknown argument" | |
| 9.4 | `openlens` (no command) | Shows help + "Please specify a command" | |
| 9.5 | `openlens hooks install` (outside git repo) | Error: "Not a git repository" (exit 2) | |
| 9.6 | `openlens agent disable nonexistent` | Error: "not found in config" (exit 2) | |

---

## 10. Environment Variables

| # | Variable | Test | Expected | Pass? |
|---|----------|------|----------|-------|
| 10.1 | `OPENLENS_SKIP=1` | `git commit` with hooks installed | Hook skipped | |
| 10.2 | `OPENLENS_AGENTS=security` | `git commit` with hooks installed | Only security runs | |
| 10.3 | `OPENLENS_DEBUG=1` | `openlens run --staged` | Debug output on stderr | |
| 10.4 | `NO_COLOR=1` | `openlens run --staged` | No ANSI colors in output | |

---

## 11. Version and Metadata

| # | Check | Expected | Pass? |
|---|-------|----------|-------|
| 11.1 | `openlens -v` | Shows current version | |
| 11.2 | `openlens --version` | Same as above | |
| 11.3 | Server version | `curl localhost:5555/` shows matching version | |
| 11.4 | SARIF version | `--format sarif` driver.version matches | |
| 11.5 | `npm view openlens version` | Matches published version | |

---

## 12. CI/CD (requires GitHub repo)

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 12.1 | Push to main | CI workflow runs (typecheck, test, smoke test) | |
| 12.2 | Open PR | PR review workflow runs | |
| 12.3 | PR with issues | Inline comments posted on specific lines | |
| 12.4 | PR with critical issues | Review submitted as REQUEST_CHANGES | |
| 12.5 | Push fix to PR | Resolved issues marked, progress shown | |
| 12.6 | Clean PR | Review submitted as COMMENT (no APPROVE — Actions limitation) | |
| 12.7 | SARIF uploaded | Appears in Security > Code scanning alerts | |

---

## Summary Checklist

| Area | Tests | Status |
|------|-------|--------|
| Setup Wizard | 11 tests | |
| Code Review | 15 tests | |
| Agent Management | 9 tests | |
| Git Hooks | 7 tests | |
| HTTP Server | 4 tests | |
| Docs Server | 7 tests | |
| Output Formats | 12 tests | |
| Platform Plugins | 4 tests | |
| Error Handling | 6 tests | |
| Environment Variables | 4 tests | |
| Version/Metadata | 5 tests | |
| CI/CD | 7 tests | |
| **Total** | **91 tests** | |
