# openlens Polish & Publish Plan

## Goal
Fix all remaining issues, then publish to npm.

---

## Phase 1: Code Quality Fixes

### 1. Read version from package.json at runtime
**Why:** Version is hardcoded in 5 places. Bumping requires editing all of them.
**Fix:** Read version from `package.json` at startup in `src/index.ts`, pass it to the server and SARIF formatter. Single source of truth.
**Files:** `src/index.ts`, `src/server/server.ts`, `src/output/format.ts`
**Tests:** Update version assertions to not hardcode — or read from package.json too.

### 2. Single review run in GitHub Action
**Why:** The action spawns two review processes when inline comments are enabled (JSON + SARIF). Doubles API calls and CI time.
**Fix:** Run once with `--format json`. Generate SARIF by running `--format sarif` on the same cached results — or add a `--format json,sarif` multi-output flag — or convert JSON to SARIF in the action's JS step using the existing `formatSarif` function.
**Files:** `action.yml`

### 3. Docs server code block syntax highlighting
**Why:** Code blocks in `openlens docs` have no syntax highlighting — just monochrome white text.
**Fix:** Add highlight.js or Prism.js from CDN (same approach as mermaid). Load client-side, apply to all `<code>` blocks.
**Files:** `src/docs/serve.ts`

### 4. Docs server search
**Why:** No way to find content across 11 wiki pages.
**Fix:** Build a simple client-side search. On page load, fetch all page titles + headings as a JSON index. Filter on keystroke. Link to matching pages/sections.
**Files:** `src/docs/serve.ts`

---

## Phase 2: Test Coverage Gaps

### 5. E2E test for pre-commit hook blocking
**Why:** We tested manually but no automated test exists.
**Fix:** Create a test that: creates a temp git repo, installs hooks via `openlens hooks install`, stages a file with `eval(userInput)`, attempts `git commit`, and asserts exit code 1 + stderr contains "critical".
**Caveat:** This requires a live model call. Mark as integration test with a timeout, or mock the review output.
**Files:** `test/e2e/hooks.test.ts`

### 6. E2E test for docs server
**Why:** No test that the docs server starts, serves pages, and returns correct content.
**Fix:** Start server on a random port, fetch `/1-overview`, assert 200 + contains `<h1>`, fetch `/nonexistent`, assert 404. Kill server.
**Files:** `test/e2e/docs.test.ts`

---

## Phase 3: Polish

### 7. Reduce docs server size
**Why:** 957 lines for a markdown renderer is heavy. Most of it is CSS.
**Fix:** Extract CSS to a separate file served as static asset. Extract the markdown converter to its own module. The serve.ts file should just be the Hono routes.
**Files:** `src/docs/serve.ts` → `src/docs/style.css` + `src/docs/markdown.ts` + `src/docs/serve.ts`

### 8. Agent prompt tuning
**Why:** The PR test showed some overlap (bugs agent flagging security issues despite boundaries). The free model sometimes ignores severity format rules.
**Fix:** Run a batch of 5 test reviews against known-vulnerable code samples. Analyze the output. Adjust prompt wording based on actual model behavior.
**Files:** `agents/*.md`

---

## Phase 4: Publish

### 9. Pre-publish checklist
- [ ] `bun run typecheck` passes
- [ ] `bun test` — 244+ tests pass
- [ ] `bun run build` — clean compilation
- [ ] `openlens --version` shows correct version
- [ ] `openlens doctor` passes
- [ ] All docs accurate
- [ ] CHANGELOG.md up to date
- [ ] README has npm install instructions
- [ ] package.json has correct metadata (description, keywords, license, repository)

### 10. Publish to npm
```bash
npm publish --access public
```

### 11. Post-publish
- [ ] `npm install -g openlens` works
- [ ] `openlens --version` shows correct version
- [ ] Update README install section from "clone" to "npm install"
- [ ] Tag release: `git tag v0.2.0 && git push --tags`
- [ ] Create GitHub release with changelog

---

## Priority Order

| # | Task | Effort | Impact |
|---|------|--------|--------|
| 1 | Version from package.json | 15 min | High — prevents version sync bugs |
| 2 | Single review in CI | 30 min | High — halves CI time and API cost |
| 5 | Hook blocking e2e test | 20 min | Medium — validates critical feature |
| 6 | Docs server e2e test | 15 min | Medium — validates docs command |
| 3 | Syntax highlighting | 15 min | Low — cosmetic |
| 4 | Docs search | 45 min | Low — nice to have |
| 7 | Refactor docs server | 30 min | Low — code cleanliness |
| 8 | Agent prompt tuning | 1 hr | Medium — improves review quality |
| 9-11 | Publish | 30 min | High — the whole point |
