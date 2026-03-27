# Using openlens as a Plugin in AI Coding Platforms

openlens integrates with four AI coding platforms as a plugin:

- **OpenCode** -- built-in plugin via `src/plugin.ts`
- **Claude Code** -- slash command skill via `plugins/claude-code/SKILL.md`
- **Codex CLI** -- registered tool via `plugins/codex/`
- **Gemini CLI** -- registered tool via `plugins/gemini/`

All plugins follow the same pattern: they call `openlens run --format json` (or `--format text`) under the hood, passing through mode, agents, and branch parameters. The library API (`src/lib.ts`) is also available for custom integrations.

**Prerequisite:** Install `openlens` and ensure it is available on your `PATH`.

```bash
# Verify installation
openlens --version
```

---

## Claude Code

The Claude Code plugin adds an `/openlens` slash command as a skill file.

### What it does

When you type `/openlens` in Claude Code, it reads the skill definition and runs the `openlens` CLI with your flags. The output is shown directly in the conversation, and Claude offers to help fix any issues found.

### Installation

Copy or symlink the skill directory into Claude Code's skills folder:

```bash
cp -r plugins/claude-code ~/.claude/skills/openlens
```

Or with a symlink (keeps it in sync with the repo):

```bash
ln -s "$(pwd)/plugins/claude-code" ~/.claude/skills/openlens
```

### Usage

```
/openlens                         # review staged changes (default)
/openlens --unstaged              # review unstaged changes
/openlens --branch main           # review diff against a branch
/openlens --agents security,bugs  # run specific agents only
/openlens --no-verify             # skip verification pass
```

### How it works

The skill file (`plugins/claude-code/SKILL.md`) contains YAML frontmatter with the skill name and description, followed by instructions that tell Claude Code to execute:

```
openlens run --staged --format text
```

User-provided flags like `--unstaged` or `--branch main` are passed through directly. Claude Code reads the skill file, builds the CLI command, and executes it.

---

## Codex CLI

The Codex plugin adds `$openlens` as a skill that Codex can invoke.

### What it does

When you type `$openlens` or ask Codex to review your code, it runs the `openlens` CLI and presents the results.

### Installation

Copy the skill to your Codex skills directory:

```bash
cp -r plugins/codex ~/.codex/skills/openlens
```

### Usage

```
$openlens                              # review staged changes
$openlens review against main          # review branch diff
$openlens just check security          # run specific agents
```

Or just ask naturally — Codex auto-matches the skill when you say "review my code", "check for bugs", etc.

### Note

Codex runs commands in a sandbox by default. openlens needs network access to call AI models. Use `codex --full-auto` or approve network access when prompted.

---

## Gemini CLI

The Gemini plugin adds `/openlens` as a custom command.

### What it does

When you type `/openlens` in Gemini CLI, it runs `openlens run --staged --format json`, then Gemini analyzes and summarizes the results.

### Installation

Copy the command file to your project's `.gemini/commands/` directory:

```bash
mkdir -p .gemini/commands
cp plugins/gemini/openlens.toml .gemini/commands/openlens.toml
```

Or for global access:

```bash
mkdir -p ~/.gemini/commands
cp plugins/gemini/openlens.toml ~/.gemini/commands/openlens.toml
```

### Usage

```
/openlens                    # review staged changes
```

The `{{args}}` placeholder captures any user input after the command name.

The tool accepts the same parameters as the Codex plugin: `mode`, `agents`, and `branch`.

### The tool.ts wrapper

The wrapper at `plugins/gemini/tool.ts` exports a `review` function that is functionally identical to the Codex wrapper:

1. Builds CLI arguments: `run --format json`
2. Sets mode via `--unstaged`, `--branch <name>`, or `--staged`
3. Appends `--agents <names>` if provided
4. Executes `openlens` via `execSync` with a 5-minute timeout
5. Returns raw JSON output or a JSON error object on failure

---

## OpenCode (Built-in)

openlens ships as a native OpenCode plugin. No separate installation is needed -- just enable it in your config.

### Enable the plugin

Add `openlens` to your OpenCode configuration:

```json
{
  "plugin": ["openlens"]
}
```

### Registered tools

The plugin (`src/plugin.ts`) registers four tools:

| Tool | Description | Use case |
|------|-------------|----------|
| `openlens` | Run a full review with all or selected agents | Primary review workflow |
| `openlens-delegate` | Ask a specific agent to analyze particular files or patterns | Targeted specialist review |
| `openlens-conventions` | Load project review instructions from AGENTS.md, CLAUDE.md, REVIEW.md, and config | Understand project-specific rules |
| `openlens-agents` | List available agents and their capabilities | Discover what specialists exist |

#### openlens

```
openlens(mode?: "staged" | "unstaged" | "branch" | "auto",
         agents?: string,
         branch?: string,
         verify?: boolean)
```

Runs a full review. Defaults to staged changes with all agents and verification enabled.

#### openlens-delegate

```
openlens-delegate(agent: string, question: string, files?: string)
```

Delegates a focused question to a specific agent. For example, ask the `security` agent to review authentication logic in a specific file.

#### openlens-conventions

```
openlens-conventions()
```

Returns project review instructions gathered from instruction files and config. No parameters.

#### openlens-agents

```
openlens-agents()
```

Lists all available agents with their descriptions, models, allowed tools, and step limits.

### Automatic behaviors

The OpenCode plugin also configures two automatic behaviors:

- **Auto-approve read-only tools:** When an openlens session uses read-only tools (read, grep, glob, list, lsp, skill, view, find, diagnostics), they are automatically approved without prompting.
- **Temperature pinning:** Review agent sessions have their temperature set to 0 for deterministic output.

---

## Using the Library API Directly

For custom integrations beyond the provided plugins, import from `openlens` directly. The public API is exported from `src/lib.ts`.

### Key imports

```typescript
import {
  runReview,
  runSingleAgentReview,
  loadConfig,
  loadAgents,
  filterAgents,
  getDiff,
  formatJson,
  formatText,
  formatMarkdown,
  formatGitHubReview,
} from "openlens"

import type {
  Config,
  ReviewResult,
  Issue,
  Agent,
  GitHubReview,
} from "openlens"
```

### Example: build a custom plugin

```typescript
import { runReview, loadConfig, filterAgents, formatJson } from "openlens"

async function myCustomReview(directory: string) {
  // Load project config (reads openlens.json, AGENTS.md, etc.)
  let config = await loadConfig(directory)

  // Optionally filter to specific agents
  config = filterAgents(config, "security,bugs")

  // Run the review on staged changes
  const result = await runReview(config, "staged", directory)

  // Format as JSON for programmatic consumption
  const json = formatJson(result)
  return json
}
```

### Example: generate a GitHub PR review

```typescript
import { runReview, loadConfig, formatGitHubReview } from "openlens"

async function createPRReview(directory: string) {
  const config = await loadConfig(directory)
  const result = await runReview(config, "branch", directory)

  // Format as a GitHub review with inline comments
  const review = formatGitHubReview(result)
  // review.body contains the summary
  // review.comments contains file-level comments with line numbers
  return review
}
```

### Available exports

The full list of public exports from `src/lib.ts`:

| Export | Kind | Description |
|--------|------|-------------|
| `runReview` | function | Run a full multi-agent review |
| `runSingleAgentReview` | function | Run review with one specific agent |
| `filterByConfidence` | function | Filter issues by confidence threshold |
| `loadConfig` | function | Load project configuration |
| `loadInstructions` | function | Load review instructions from files |
| `discoverRules` | function | Discover project rules |
| `formatDiscoveredRules` | function | Format discovered rules as text |
| `gatherStrategyContext` | function | Gather context for review strategy |
| `loadAgents` | function | Load all configured agents |
| `filterAgents` | function | Filter agents by name |
| `excludeAgents` | function | Exclude agents by name |
| `getDiff` | function | Get git diff for a mode |
| `getAutoDetectedDiff` | function | Auto-detect and get the appropriate diff |
| `getDiffStats` | function | Get diff statistics |
| `formatText` | function | Format results as plain text |
| `formatJson` | function | Format results as JSON |
| `formatSarif` | function | Format results as SARIF |
| `formatMarkdown` | function | Format results as Markdown |
| `formatGitHubReview` | function | Format as GitHub PR review object |
| `loadSuppressRules` | function | Load suppression rules |
| `shouldSuppress` | function | Check if an issue should be suppressed |
| `createBus` | function | Create an event bus |
| `bus` | instance | Default event bus |
| `createServer` | function | Create the openlens server |
| `detectCI` | function | Detect CI environment |
| `resolveOpencodeBin` | function | Resolve OpenCode binary path |
| `inferBaseBranch` | function | Infer the base branch name |

---

## Hooks

openlens also supports automatic code review via git hooks and platform-specific hooks (Claude Code, Gemini CLI, Codex CLI). For setup instructions, see the [Hooks Guide](./hooks-guide.md).
