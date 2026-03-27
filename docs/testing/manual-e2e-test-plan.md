# openlens Manual End-to-End Test Plan

Run through this plan to validate the entire application works correctly.

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
| 1.1.4 | Platform plugins detected | Detected platforms configured (skills + hooks) | |
| 1.1.5 | CI/CD workflow created | .github/workflows/openlens-review.yml exists | |
| 1.1.6 | using-openlens skill installed | ~/.claude/skills/using-openlens/SKILL.md exists (if Claude Code) | |
| 1.1.7 | using-openlens skill for Codex | ~/.codex/skills/using-openlens/SKILL.md exists (if Codex) | |

### 1.2 Individual setup sections

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 1.2.1 | `openlens setup --config --yes` | Only openlens.json created | |
| 1.2.2 | `openlens setup --agents --yes` | Only agents/*.md created | |
| 1.2.3 | `openlens setup --hooks --yes` | Only .git/hooks/ created | |
| 1.2.4 | `openlens setup --plugins --yes` | Only platform skills/hooks installed | |
| 1.2.5 | `openlens setup --ci --yes` | Only .github/workflows/ created | |
| 1.2.6 | `openlens setup --help` | Shows all flags | |

Clean up: `rm -rf /tmp/e2e-test`

---

## 2. Code Review (the core feature)

### 2.1 Setup test repo with comprehensive vulnerable code

This test repo has issues for ALL four agents across multiple languages/patterns:

```bash
mkdir /tmp/review-test && cd /tmp/review-test
git init && git config user.email "t@t.com" && git config user.name "T"
echo "x" > README.md && git add . && git commit -m "init"
openlens init
```

Create multi-file test with known issues:

```bash
cat > auth.ts << 'EOF'
import { createHash } from "crypto"

// SECURITY: hardcoded secret
const JWT_SECRET = "super-secret-jwt-key-2024"
const DB_URL = "postgres://admin:password123@db.internal:5432/users"

// SECURITY: weak crypto for passwords
export function hashPassword(password: string): string {
  return createHash("md5").update(password).digest("hex")
}

// SECURITY: SQL injection + BUGS: no null check on result
export async function login(db: any, email: string, password: string) {
  const hash = hashPassword(password)
  const result = await db.query(
    `SELECT * FROM users WHERE email = '${email}' AND password_hash = '${hash}'`
  )
  return result.rows[0].token  // null deref if no rows
}

// SECURITY: eval with user input
export function processTemplate(input: string) {
  return eval(input)
}

// SECURITY: path traversal
import path from "path"
export function readUserFile(filename: string) {
  return require("fs").readFileSync(path.join("/uploads", filename))
}

// SECURITY: loose equality in auth check
export function verifyToken(token: string, expected: string) {
  if (token == expected) return true  // timing attack + type coercion
  return false
}

// SECURITY: SSRF
export async function fetchUrl(url: string) {
  return fetch(url)  // user-controlled URL, no validation
}
EOF

cat > api.ts << 'EOF'
import { login, readUserFile, fetchUrl } from "./auth"

// BUGS: missing error handling
export async function handleLogin(req: any, res: any) {
  const { email, password } = req.body
  const token = await login(req.db, email, password)  // unhandled if login throws
  res.json({ token })
}

// BUGS: resource leak - stream not closed on error
export async function streamFile(req: any, res: any) {
  const stream = require("fs").createReadStream(req.params.path)
  stream.pipe(res)
  // no error handler - if pipe fails, stream leaks
}

// BUGS: race condition - read-modify-write without lock
let requestCount = 0
export function countRequest() {
  const current = requestCount  // read
  requestCount = current + 1    // write - another request can interleave
  return requestCount
}

// BUGS: floating promise
export function logAccess(userId: string) {
  saveToDatabase(userId)  // missing await - errors silently lost
}
async function saveToDatabase(id: string) {
  // simulated async
}

// BUGS: error swallowed
export async function getProfile(db: any, id: string) {
  try {
    return await db.query(`SELECT * FROM profiles WHERE id = ${id}`)
  } catch (e) {
    console.log(e)  // swallowed - caller thinks profile is undefined, not errored
  }
}

// SECURITY: BOLA/IDOR - no ownership check
export async function getOrder(db: any, req: any) {
  return db.query(`SELECT * FROM orders WHERE id = ${req.params.id}`)
  // does NOT verify req.user owns this order
}

// SECURITY: mass assignment
export async function updateUser(db: any, req: any) {
  const fields = Object.keys(req.body)
    .map(k => `${k} = '${req.body[k]}'`)
    .join(", ")
  await db.query(`UPDATE users SET ${fields} WHERE id = ${req.user.id}`)
  // user can set isAdmin, role, etc via request body
}

// BUGS: off-by-one in pagination
export async function listItems(db: any, page: number, size: number) {
  const offset = page * size  // should be (page - 1) * size for 1-based pages
  return db.query(`SELECT * FROM items LIMIT ${size} OFFSET ${offset}`)
}
EOF

cat > routes.ts << 'EOF'
import { handleLogin, streamFile, getOrder, updateUser, listItems } from "./api"

// PERFORMANCE: N+1 query
export async function listUsersWithProfiles(db: any) {
  const users = await db.query("SELECT * FROM users")
  for (const user of users.rows) {
    user.profile = await db.query(
      `SELECT * FROM profiles WHERE user_id = ${user.id}`
    )
  }
  return users.rows
}

// PERFORMANCE: unbounded cache - grows forever
const cache: Record<string, any> = {}
export function cachedLookup(key: string, compute: () => any) {
  if (!cache[key]) cache[key] = compute()
  return cache[key]
}

// PERFORMANCE: synchronous blocking in async context
export async function handleUpload(req: any) {
  const data = require("fs").readFileSync(req.file.path)  // blocks event loop
  return processData(data)
}
function processData(data: Buffer) { return data }

// PERFORMANCE: sequential awaits that could be parallel
export async function getDashboard(db: any, userId: string) {
  const user = await db.query(`SELECT * FROM users WHERE id = ${userId}`)
  const orders = await db.query(`SELECT * FROM orders WHERE user_id = ${userId}`)
  const notifications = await db.query(`SELECT * FROM notifications WHERE user_id = ${userId}`)
  // these 3 queries are independent - should use Promise.all
  return { user, orders, notifications }
}

// PERFORMANCE: O(n^2) - includes inside loop
export function findDuplicates(items: string[]) {
  const dupes: string[] = []
  for (const item of items) {
    if (items.filter(i => i === item).length > 1 && !dupes.includes(item)) {
      dupes.push(item)
    }
  }
  return dupes
}

// STYLE: inconsistent naming (rest of codebase uses camelCase)
export function get_user_by_id(db: any, user_id: string) {
  return db.query(`SELECT * FROM users WHERE id = ${user_id}`)
}

// STYLE: god function - does too many things
export async function processRequest(req: any, res: any, db: any) {
  // validate
  if (!req.body.email) { res.status(400).json({ error: "email required" }); return }
  if (!req.body.password) { res.status(400).json({ error: "password required" }); return }
  // authenticate
  const user = await db.query(`SELECT * FROM users WHERE email = '${req.body.email}'`)
  if (!user.rows[0]) { res.status(401).json({ error: "not found" }); return }
  // hash and compare
  const hash = require("crypto").createHash("md5").update(req.body.password).digest("hex")
  if (user.rows[0].password_hash !== hash) { res.status(401).json({ error: "wrong password" }); return }
  // create session
  const session = await db.query(`INSERT INTO sessions (user_id) VALUES (${user.rows[0].id}) RETURNING *`)
  // send response
  res.json({ session: session.rows[0], user: user.rows[0] })
}

// STYLE: dead code
export function unusedHelper() {
  return "this function is never called anywhere"
}

// STYLE: magic numbers
export function calculateDiscount(total: number) {
  if (total > 100) return total * 0.15
  if (total > 50) return total * 0.10
  return total * 0.05
}
EOF

git add auth.ts api.ts routes.ts
```

### 2.2 Expected findings per agent

| # | Agent | Expected Findings | Pass? |
|---|-------|-------------------|-------|
| **Security** | | |
| 2.2.1 | security | Hardcoded JWT_SECRET and DB_URL | |
| 2.2.2 | security | SQL injection in login, getOrder, updateUser, listItems, get_user_by_id, processRequest | |
| 2.2.3 | security | eval() in processTemplate | |
| 2.2.4 | security | Path traversal in readUserFile (path.join not safe for absolute paths) | |
| 2.2.5 | security | Loose equality in verifyToken (timing attack) | |
| 2.2.6 | security | SSRF in fetchUrl (no URL validation) | |
| 2.2.7 | security | BOLA/IDOR in getOrder (no ownership check) | |
| 2.2.8 | security | Mass assignment in updateUser | |
| 2.2.9 | security | MD5 for password hashing | |
| **Bugs** | | |
| 2.2.10 | bugs | Null dereference in login (result.rows[0].token when no rows) | |
| 2.2.11 | bugs | Missing error handling in handleLogin (unhandled rejection) | |
| 2.2.12 | bugs | Resource leak in streamFile (stream not closed on error) | |
| 2.2.13 | bugs | Race condition in countRequest (read-modify-write) | |
| 2.2.14 | bugs | Floating promise in logAccess (missing await) | |
| 2.2.15 | bugs | Swallowed error in getProfile (catch logs but doesn't re-throw) | |
| 2.2.16 | bugs | Off-by-one in listItems pagination | |
| **Performance** | | |
| 2.2.17 | performance | N+1 query in listUsersWithProfiles | |
| 2.2.18 | performance | Unbounded cache in cachedLookup | |
| 2.2.19 | performance | Synchronous readFileSync in async handleUpload | |
| 2.2.20 | performance | Sequential awaits in getDashboard (should be Promise.all) | |
| 2.2.21 | performance | O(n^2) in findDuplicates (filter + includes inside loop) | |
| **Style** | | |
| 2.2.22 | style | Inconsistent naming: get_user_by_id (snake_case vs camelCase) | |
| 2.2.23 | style | God function: processRequest (validate + auth + hash + session + response) | |
| 2.2.24 | style | Dead code: unusedHelper (never imported/called) | |
| 2.2.25 | style | Magic numbers in calculateDiscount (100, 50, 0.15, 0.10, 0.05) | |

### 2.3 Review with each agent individually

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 2.3.1 | `openlens run --staged --agents security --no-verify` | Finds items 2.2.1-2.2.9 | |
| 2.3.2 | `openlens run --staged --agents bugs --no-verify` | Finds items 2.2.10-2.2.16 | |
| 2.3.3 | `openlens run --staged --agents performance --no-verify` | Finds items 2.2.17-2.2.21 | |
| 2.3.4 | `openlens run --staged --agents style --no-verify` | Finds items 2.2.22-2.2.25 | |
| 2.3.5 | `openlens run --staged` | All agents run, dedup removes overlaps, verification filters false positives | |

### 2.4 Review quality validation

| # | Check | Expected | Pass? |
|---|-------|----------|-------|
| 2.4.1 | Severity format | Only critical/warning/info (not HIGH/ERROR/etc) | |
| 2.4.2 | Confidence field | Each issue has high/medium/low | |
| 2.4.3 | Agent boundaries | Bugs doesn't flag SQL injection, style doesn't flag auth issues | |
| 2.4.4 | Evidence in messages | Issues reference specific files/lines, mention what was investigated | |
| 2.4.5 | Fix suggestions | Issues include actionable fix recommendations | |
| 2.4.6 | No false positives | No issues flagged on clean/correct code patterns | |
| 2.4.7 | Patches provided | At least some issues include diff patches | |

### 2.5 All output formats

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 2.5.1 | `openlens run --staged --format text` | Colorized output, progress streaming | |
| 2.5.2 | `openlens run --staged --format json` | Valid JSON, issues with all fields | |
| 2.5.3 | `openlens run --staged --format sarif` | Valid SARIF v2.1.0, confidence in properties | |
| 2.5.4 | `openlens run --staged --format markdown` | Markdown with `<!-- openlens-review -->` marker | |

### 2.6 All run flags

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 2.6.1 | `openlens run --dry-run --staged` | Shows plan, no API calls | |
| 2.6.2 | `openlens run --staged --no-verify` | Skips verification pass | |
| 2.6.3 | `openlens run --staged --no-context` | Diff only, no full file context | |
| 2.6.4 | `openlens run --staged -m opencode/gpt-5-nano` | Uses specified model | |
| 2.6.5 | `openlens run --staged --exclude-agents style` | 3 agents (style excluded) | |
| 2.6.6 | `openlens run --staged --agents security,bugs` | Only 2 agents | |

### 2.7 Empty diff handling

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 2.7.1 | `openlens run --staged` (nothing staged) | "No issues found (0 files, 0 agents)" exit 0 | |
| 2.7.2 | `openlens run --staged --format json` (empty) | `{"issues":[],...}` exit 0 | |

Clean up: `rm -rf /tmp/review-test`

---

## 3. Agent Management

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 3.1 | `openlens agent list` | Shows 4 agents with model, mode, tools, steps | |
| 3.2 | `openlens agent validate` | All 4 agents valid | |
| 3.3 | `openlens agent create test-agent --description "Test"` | Creates file + updates config | |
| 3.4 | `openlens agent create test-agent` | Error: "already exists" | |
| 3.5 | `openlens agent create "BAD NAME"` | Error: "lowercase alphanumeric" | |
| 3.6 | `openlens agent create custom --model opencode/gpt-5-nano --steps 3` | Correct model/steps in frontmatter | |
| 3.7 | `openlens agent disable test-agent` | "test-agent disabled" | |
| 3.8 | `openlens agent enable test-agent` | "test-agent enabled" | |
| 3.9 | `openlens agent test security --staged` | Single agent with verbose metadata | |
| 3.10 | `openlens agent test security --staged --format json` | JSON output | |
| 3.11 | `openlens agent test nonexistent --staged` | Error: "not found. Available: ..." | |

---

## 4. Git Hooks

### 4.1 Install and remove

| # | Command | Expected | Pass? |
|---|---------|----------|-------|
| 4.1.1 | `openlens hooks install` | Creates pre-commit + pre-push | |
| 4.1.2 | `openlens hooks install` (again) | "exists" (idempotent) | |
| 4.1.3 | Backup existing hook | Install over non-openlens hook creates .backup | |
| 4.1.4 | `openlens hooks remove` | Removes hooks | |
| 4.1.5 | `openlens hooks remove` (again) | "skipped" (idempotent) | |
| 4.1.6 | Remove restores backup | .backup file restored to original name | |
| 4.1.7 | `openlens hooks` (no subcommand) | Shows help with install/remove | |
| 4.1.8 | `openlens hooks install` (outside git) | Error: "Not a git repository" | |

### 4.2 Pre-commit hook blocking

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 4.2.1 | Commit with `eval(userInput)` staged | Hook BLOCKS commit (exit 1) | |
| 4.2.2 | Commit with `console.log("hello")` staged | Hook ALLOWS commit (exit 0) | |
| 4.2.3 | `OPENLENS_SKIP=1 git commit` | Hook skipped, commit succeeds | |
| 4.2.4 | `OPENLENS_AGENTS=security git commit` | Only security agent runs in hook | |

---

## 5. Platform Hooks (PreToolUse / BeforeTool)

These hooks intercept `git commit`/`git push` inside AI coding agents.

### 5.1 Claude Code hooks

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 5.1.1 | hooks/claude-code-hooks.json is valid JSON | Parses without error | |
| 5.1.2 | Has PreToolUse event | Matcher is "Bash" | |
| 5.1.3 | Command detects git commit/push | Only triggers on `git commit` or `git push` | |
| 5.1.4 | Copy to .claude/settings.json | `cp hooks/claude-code-hooks.json .claude/settings.json` works | |
| 5.1.5 | Claude Code sees the hook | Hook appears in Claude Code session (requires manual test) | |

### 5.2 Codex CLI hooks

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 5.2.1 | hooks/codex-hooks.json is valid JSON | Parses without error | |
| 5.2.2 | Has PreToolUse event | Matcher is "Bash" | |
| 5.2.3 | Copy to .codex/hooks.json | Works | |

### 5.3 Gemini CLI hooks

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 5.3.1 | hooks/gemini-hooks.json is valid JSON | Parses without error | |
| 5.3.2 | Has BeforeTool event | Matcher is "run_shell_command" | |
| 5.3.3 | Has hooksConfig.enabled | Set to true | |
| 5.3.4 | Copy to .gemini/settings.json | Works | |

### 5.4 OpenCode hooks

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 5.4.1 | hooks/opencode-hooks.ts compiles | `bun build hooks/opencode-hooks.ts --target node --outdir /tmp` succeeds | |
| 5.4.2 | Has tool.execute.before | Checks for "bash" tool with git commit/push regex | |
| 5.4.3 | Throws on critical issues | exit code 1 causes Error to be thrown | |
| 5.4.4 | OPENLENS_AGENTS env var respected | Reads from process.env | |

### 5.5 Hook config validation (automated)

```bash
# Validate all hook configs parse correctly
python3 -m json.tool hooks/claude-code-hooks.json > /dev/null && echo "claude: OK"
python3 -m json.tool hooks/codex-hooks.json > /dev/null && echo "codex: OK"
python3 -m json.tool hooks/gemini-hooks.json > /dev/null && echo "gemini: OK"
bun build hooks/opencode-hooks.ts --target node --outdir /tmp 2>&1 | tail -1
```

| # | Check | Expected | Pass? |
|---|-------|----------|-------|
| 5.5.1 | All JSON configs valid | All parse without error | |
| 5.5.2 | OpenCode hook compiles | Bundled successfully | |
| 5.5.3 | All hooks target git commit/push only | Grep for `git (commit\|push)` in each | |
| 5.5.4 | No hooks trigger on file writes | No PostToolUse/AfterTool events present | |

---

## 6. HTTP Server

```bash
openlens serve --port 5555 &
SERVER_PID=$!
```

### 6.1 Basic endpoints

| # | Endpoint | Expected | Pass? |
|---|----------|----------|-------|
| 6.1.1 | `GET /` | `{"name":"openlens","version":"<current>"}` | |
| 6.1.2 | `GET /health` | `{"status":"ok"}` | |
| 6.1.3 | `GET /agents` | JSON array of 4 agents with name, description, model, mode, steps, permission | |
| 6.1.4 | `GET /config` | JSON config with secrets redacted (no MCP env values) | |
| 6.1.5 | `GET /diff?mode=staged` | Diff statistics or empty | |

### 6.2 Review endpoint

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 6.2.1 | `POST /review` with empty body | Returns review result (may be empty) | |
| 6.2.2 | `POST /review {"mode":"staged"}` | Returns review with mode "staged" | |
| 6.2.3 | `POST /review {"agents":["security"]}` | Runs only security agent | |
| 6.2.4 | `POST /review {"verify":false}` | Skips verification pass | |

```bash
# Example curl commands
curl -s localhost:5555/
curl -s localhost:5555/health
curl -s localhost:5555/agents | python3 -m json.tool | head -20
curl -s localhost:5555/config | python3 -m json.tool | head -20
curl -X POST localhost:5555/review -H "Content-Type: application/json" -d '{"mode":"staged","agents":["security"]}' | python3 -m json.tool | head -20
```

### 6.3 Error handling

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 6.3.1 | `GET /nonexistent` | 404 or error response | |
| 6.3.2 | `POST /review` with invalid JSON | Error response, not crash | |
| 6.3.3 | `POST /review {"mode":"invalid"}` | Error or default mode | |

### 6.4 Server options

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 6.4.1 | `openlens serve --port 6666` | Listens on 6666 | |
| 6.4.2 | `openlens serve --hostname 0.0.0.0` | Binds to all interfaces | |
| 6.4.3 | `openlens serve` (port in use) | Error message, not crash | |

```bash
kill $SERVER_PID
```

---

## 7. Docs Server

```bash
openlens docs --no-open --port 4200 &
DOCS_PID=$!
sleep 2
```

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 7.1 | `GET /` | Redirects to /1-overview | |
| 7.2 | `GET /1-overview` | HTML page with sidebar, content, TOC | |
| 7.3 | `GET /10-glossary` | Glossary terms as individual cards | |
| 7.4 | `GET /nonexistent` | 404 "Page not found" | |
| 7.5 | `GET /search-index` | JSON array of pages with headings | |
| 7.6 | Mermaid diagrams | Render as SVG in the page | |
| 7.7 | Syntax highlighting | Code blocks have colored syntax | |
| 7.8 | Search input | Type text, results dropdown appears | |
| 7.9 | Sidebar order | 1 through 10 in numeric order | |
| 7.10 | Sidebar active state | Current page highlighted | |
| 7.11 | Diagram toolbar | +, -, reset, fullscreen buttons visible | |
| 7.12 | Diagram fullscreen | Click fullscreen, SVG fills viewport, Esc closes | |
| 7.13 | Cross-page links | Links between pages work | |

```bash
kill $DOCS_PID
```

---

## 8. Platform Plugins (slash commands / skills)

### 8.1 Claude Code

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 8.1.1 | `/openlens` runs | Executes review, shows results | |
| 8.1.2 | `/openlens --unstaged` | Passes flag through | |
| 8.1.3 | `/openlens --agents security` | Runs security only | |
| 8.1.4 | `using-openlens` skill available | Appears in skill list | |
| 8.1.5 | Skill triggers on "review my code" | Agent knows how to use openlens | |

### 8.2 OpenCode

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 8.2.1 | `/openlens` tool available | Listed in OpenCode tools | |
| 8.2.2 | Run review via tool | Returns review results | |

### 8.3 Gemini CLI

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 8.3.1 | `/openlens` command available | Listed in Gemini commands | |
| 8.3.2 | Run review | Summarizes results | |

### 8.4 Codex CLI

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 8.4.1 | `$openlens` skill available | Triggers on "review" | |
| 8.4.2 | Run review | Shows results (needs --full-auto or network approval) | |

---

## 9. Error Handling

| # | Command | Expected Exit | Expected Message | Pass? |
|---|---------|--------------|-----------------|-------|
| 9.1 | `openlens run --staged` (no git) | 2 | "Not a git repository" | |
| 9.2 | `openlens run --format xml` | 1 | "Invalid values" | |
| 9.3 | `openlens bogus` | 1 | "Unknown argument" | |
| 9.4 | `openlens` (no command) | 1 | "Please specify a command" | |
| 9.5 | `openlens hooks install` (no git) | 2 | "Not a git repository" | |
| 9.6 | `openlens agent disable nonexistent` | 2 | "not found in config" | |
| 9.7 | `openlens agent enable nonexistent` | 2 | "not found in config" | |
| 9.8 | `openlens agent test nonexistent` | 2 | "not found. Available:" | |
| 9.9 | `openlens agent create "BAD"` | 2 | "lowercase alphanumeric" | |

---

## 10. Environment Variables

| # | Variable | Test | Expected | Pass? |
|---|----------|------|----------|-------|
| 10.1 | `OPENLENS_SKIP=1` | git commit with hooks | Hook skipped | |
| 10.2 | `OPENLENS_AGENTS=security` | git commit with hooks | Only security runs | |
| 10.3 | `OPENLENS_DEBUG=1` | openlens run --staged | Debug output on stderr (SSE events, timing) | |
| 10.4 | `NO_COLOR=1` | openlens run --staged | No ANSI escape codes | |

---

## 11. Version and Metadata

| # | Check | Expected | Pass? |
|---|-------|----------|-------|
| 11.1 | `openlens -v` | Current version | |
| 11.2 | `openlens --version` | Same | |
| 11.3 | `openlens -h` | All 9 commands listed | |
| 11.4 | `openlens run --help` | All flags shown | |
| 11.5 | Server version matches | `curl /` version = `openlens -v` | |
| 11.6 | SARIF version matches | `--format sarif` driver.version = `openlens -v` | |
| 11.7 | `npm view openlens version` | Matches published version | |

---

## 12. CI/CD (requires GitHub repo)

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 12.1 | Push to main | CI workflow runs (typecheck, tests, smoke tests) | |
| 12.2 | CI passes | All steps green | |
| 12.3 | Open PR with issues | PR review workflow triggers | |
| 12.4 | Inline comments | Posted on specific lines of the diff | |
| 12.5 | Critical issues | Review submitted as REQUEST_CHANGES | |
| 12.6 | Push fix to PR | Resolved comments marked, progress shown | |
| 12.7 | Clean PR | Review submitted as COMMENT | |
| 12.8 | SARIF uploaded | Appears in Security > Code scanning alerts | |
| 12.9 | Fingerprint state | Hidden comment with base64 state exists | |

---

## Summary

| Area | Tests |
|------|-------|
| Setup Wizard | 13 |
| Code Review (core) | 32 |
| Agent Management | 11 |
| Git Hooks | 12 |
| Platform Hooks | 16 |
| HTTP Server | 12 |
| Docs Server | 13 |
| Platform Plugins | 9 |
| Error Handling | 9 |
| Environment Variables | 4 |
| Version/Metadata | 7 |
| CI/CD | 9 |
| **Total** | **147** |
