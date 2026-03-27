# OpenLens Setup Wizard Implementation Plan

> **Issue:** https://github.com/Traves-Theberge/OpenLens/issues/11

**Goal:** Replace basic `openlens init` with a full interactive setup wizard that configures config, hooks, plugins, CI/CD, and agents in one flow.

**Architecture:** New `src/setup/` module with section-based wizard. Each section is independent and runnable via flags. Uses `@clack/prompts` for beautiful terminal UI.

---

## Task 1: Add @clack/prompts dependency and scaffold setup module

**Files:**
- Modify: `package.json`
- Create: `src/setup/index.ts`

**Steps:**
- [ ] Add `@clack/prompts` to dependencies (`bun add @clack/prompts`)
- [ ] Create `src/setup/index.ts` with the main `runSetup(options)` function skeleton
- [ ] Options type: `{ config?: boolean, hooks?: boolean, plugins?: boolean, ci?: boolean, agents?: boolean, yes?: boolean }`
- [ ] If no flags, run all sections
- [ ] Commit

---

## Task 2: Register `openlens setup` command in CLI

**Files:**
- Modify: `src/index.ts`

**Steps:**
- [ ] Add `setup` command with flags: `--config`, `--hooks`, `--plugins`, `--ci`, `--agents`, `--yes`
- [ ] Import and call `runSetup()` from `src/setup/index.ts`
- [ ] Keep `openlens init` working (alias to `openlens setup --config --yes`)
- [ ] Commit

---

## Task 3: Config section — model and review settings

**Files:**
- Create: `src/setup/config.ts`

**Steps:**
- [ ] `setupConfig(cwd, options)` function
- [ ] Detect existing `openlens.json` — offer to update or overwrite
- [ ] Model selection: fetch available models from `openlens models`, show as select list
- [ ] Review settings prompts: default mode, minConfidence, verify, fullFileContext
- [ ] Suppression rules: ask for file patterns to ignore
- [ ] Write `openlens.json`
- [ ] `--yes` flag: use defaults (big-pickle, staged, medium, verify=true, context=true)
- [ ] Commit

---

## Task 4: Agents section — enable, disable, create

**Files:**
- Create: `src/setup/agents.ts`

**Steps:**
- [ ] `setupAgents(cwd, config, options)` function
- [ ] Multi-select: which built-in agents to enable (security, bugs, performance, style)
- [ ] Copy selected agent .md files to `agents/` directory
- [ ] Offer to create a custom agent: name, description, focus area
- [ ] Generate agent markdown from template with frontmatter
- [ ] Update `openlens.json` agent entries
- [ ] Offer to open agent file in `$EDITOR` for customization
- [ ] `--yes` flag: enable all 4 defaults
- [ ] Commit

---

## Task 5: Git hooks section

**Files:**
- Create: `src/setup/hooks.ts`

**Steps:**
- [ ] `setupHooks(cwd, options)` function
- [ ] Confirm: install pre-commit hook? (default yes)
- [ ] Confirm: install pre-push hook? (default yes)
- [ ] Select which agents for pre-commit (default: security, bugs)
- [ ] Install hooks using existing logic from `openlens hooks install`
- [ ] Show OPENLENS_SKIP and OPENLENS_AGENTS env vars for customization
- [ ] `--yes` flag: install both with defaults
- [ ] Commit

---

## Task 6: Platform plugins section

**Files:**
- Create: `src/setup/plugins.ts`

**Steps:**
- [ ] `setupPlugins(cwd, options)` function
- [ ] Auto-detect installed platforms:
  - Claude Code: check `~/.claude/` exists
  - Codex: check `~/.codex/` exists
  - Gemini: check `~/.gemini/` exists
  - OpenCode: check for `opencode` binary or `opencode.json`
- [ ] For each detected platform, offer to install:
  - Slash command/skill (plugin)
  - Platform hook (PreToolUse/BeforeTool for git commit/push)
- [ ] Copy files to correct locations:
  - Claude Code: `~/.claude/skills/openlens/SKILL.md` + merge hooks into `.claude/settings.json`
  - Codex: `~/.codex/skills/openlens/SKILL.md` + create `.codex/hooks.json`
  - Gemini: `.gemini/commands/openlens.toml` + merge hooks into `.gemini/settings.json`
  - OpenCode: add `"plugin": ["openlens"]` to `opencode.json`
- [ ] Handle merging with existing settings files (don't overwrite user's other hooks)
- [ ] `--yes` flag: install all detected platforms
- [ ] Commit

---

## Task 7: CI/CD section

**Files:**
- Create: `src/setup/cicd.ts`

**Steps:**
- [ ] `setupCICD(cwd, options)` function
- [ ] Auto-detect repo hosting:
  - GitHub: check `.git/config` for github.com remote
  - GitLab: check for gitlab.com remote
- [ ] For GitHub:
  - Select options: inline comments, SARIF upload, fail-on-critical
  - Select agents to run in CI
  - Generate `.github/workflows/openlens-review.yml`
  - Include base branch fetch step
- [ ] For GitLab:
  - Generate `.gitlab-ci.yml` stage
- [ ] Show what was created
- [ ] `--yes` flag: GitHub Actions with all defaults
- [ ] Commit

---

## Task 8: Wire all sections together in wizard

**Files:**
- Modify: `src/setup/index.ts`

**Steps:**
- [ ] Intro banner with OpenLens branding
- [ ] Run sections in order: config → agents → hooks → plugins → CI/CD
- [ ] Each section shows a header and summary of what it did
- [ ] Final summary: list all files created/modified
- [ ] Handle Ctrl+C gracefully (cancel message, no partial writes)
- [ ] Commit

---

## Task 9: Tests

**Files:**
- Create: `test/e2e/setup.test.ts`

**Steps:**
- [ ] Test `openlens setup --yes` creates all expected files in a temp repo
- [ ] Test `openlens setup --config --yes` only creates openlens.json + agents
- [ ] Test `openlens setup --hooks --yes` installs git hooks
- [ ] Test `openlens setup --ci --yes` generates workflow file
- [ ] Test existing `openlens init` still works
- [ ] Commit

---

## Task 10: Documentation

**Files:**
- Modify: `README.md` — update Quick Start to use `openlens setup`
- Modify: `USER_GUIDE.md` — add setup wizard section
- Modify: `docs/guides/cli-guide.md` — add setup command
- Modify: `wiki/6-cli-reference.md` — add setup command docs
- Modify: `CHANGELOG.md` — add entry

**Steps:**
- [ ] Update all docs
- [ ] Commit

---

## Priority Order

| Task | Effort | Dependencies |
|------|--------|-------------|
| 1. Scaffold + dependency | 10 min | None |
| 2. CLI command | 10 min | Task 1 |
| 3. Config section | 30 min | Task 1 |
| 4. Agents section | 30 min | Task 3 |
| 5. Git hooks section | 20 min | Task 1 |
| 6. Platform plugins | 45 min | Task 1 |
| 7. CI/CD section | 30 min | Task 1 |
| 8. Wire together | 20 min | Tasks 3-7 |
| 9. Tests | 30 min | Task 8 |
| 10. Docs | 20 min | Task 8 |

**Total: ~4 hours**
