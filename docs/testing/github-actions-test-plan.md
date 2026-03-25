# GitHub Actions Test Plan

Test plan for validating the OpenLens GitHub Action (`action.yml`) and PR review workflow (`.github/workflows/pr-review.yml`).

---

## Prerequisites

- A test repository with OpenLens configured
- A PR with code changes to trigger the workflow
- GitHub Actions enabled on the repo
- `pull-requests: write` and `security-events: write` permissions

---

## 1. Action Inputs

Test each input by modifying the workflow file or using `workflow_dispatch`.

| # | Input | Value | Expected | Pass? |
|---|-------|-------|----------|-------|
| 1.1 | `mode` | `branch` (default) | Reviews diff against base branch | |
| 1.2 | `mode` | `staged` | Reviews staged changes | |
| 1.3 | `agents` | `security,bugs` | Only runs 2 agents | |
| 1.4 | `format` | `sarif` (default) | Produces SARIF file | |
| 1.5 | `base-branch` | `${{ github.base_ref }}` | Uses PR base branch | |
| 1.6 | `verify` | `true` (default) | Verification pass runs | |
| 1.7 | `verify` | `false` | Skips verification | |
| 1.8 | `upload-sarif` | `true` (default) | SARIF uploaded to Code Scanning | |
| 1.9 | `upload-sarif` | `false` | No SARIF upload | |
| 1.10 | `fail-on-critical` | `true` (default) | Workflow fails if critical issues | |
| 1.11 | `fail-on-critical` | `false` | Workflow passes regardless | |
| 1.12 | `comment-on-pr` | `true` | Posts review on PR | |
| 1.13 | `comment-on-pr` | `false` (default) | No PR comment | |
| 1.14 | `inline-comments` | `true` (default) | Inline comments on specific lines | |
| 1.15 | `inline-comments` | `false` | Summary comment only | |
| 1.16 | `auto-resolve` | `true` (default) | Resolved issues get strikethrough | |
| 1.17 | `model` | `opencode/gpt-5-nano` | All agents use specified model | |

---

## 2. Action Outputs

| # | Output | Expected | Pass? |
|---|--------|----------|-------|
| 2.1 | `issues` | Number of total issues found | |
| 2.2 | `critical` | Number of critical issues | |
| 2.3 | `sarif-file` | Path to generated SARIF file | |

---

## 3. Inline PR Comments

Create a PR with an obvious issue (e.g. `eval(userInput)`) and set `comment-on-pr: "true"`.

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 3.1 | PR with critical issues | Review submitted as `REQUEST_CHANGES` with inline comments on specific lines | |
| 3.2 | PR with warnings only | Review submitted as `COMMENT` | |
| 3.3 | Clean PR | Review submitted as `APPROVE` | |
| 3.4 | Comment body | Each comment has severity, title, message, agent name | |
| 3.5 | Multi-line issues | Comments use `start_line`/`line` range | |
| 3.6 | Fix suggestions | Comments include `**Fix:**` and diff patches | |
| 3.7 | State comment | Hidden `<!-- openlens-review-state: ... -->` comment exists with base64 fingerprints | |

---

## 4. Incremental Updates

Push a fix to an existing PR that had issues.

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 4.1 | Fix one issue, push | Previously resolved comment gets strikethrough + "Resolved in latest push" | |
| 4.2 | Add new issue, push | New inline comment appears, not duplicating old ones | |
| 4.3 | Fix all issues, push | APPROVE review, all previous comments resolved | |
| 4.4 | Progress summary | State comment updated with "(N resolved, N new, N remaining)" | |
| 4.5 | Fingerprint stability | Same issue on different line (after rebase) is recognized as the same issue | |

---

## 5. SARIF Upload

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 5.1 | `upload-sarif: true` | SARIF file uploaded to GitHub Code Scanning | |
| 5.2 | Check Security tab | Issues appear under "Code scanning alerts" | |
| 5.3 | SARIF contains confidence | Results have `rank` and `properties.confidence` | |

---

## 6. Workflow Triggers

| # | Trigger | Expected | Pass? |
|---|---------|----------|-------|
| 6.1 | `pull_request: opened` | Workflow runs | |
| 6.2 | `pull_request: synchronize` (new push) | Workflow runs, incremental update | |
| 6.3 | `pull_request: reopened` | Workflow runs | |

---

## 7. Error Cases

| # | Scenario | Expected | Pass? |
|---|----------|----------|-------|
| 7.1 | No API keys, free model | Runs successfully with `opencode/big-pickle` | |
| 7.2 | Invalid model | Graceful error, workflow fails | |
| 7.3 | Empty diff (no changes) | "No issues found", workflow passes | |
| 7.4 | Missing permissions | GitHub API errors are caught, workflow doesn't crash | |

---

## 8. CI Environment Detection

| # | Test | Expected | Pass? |
|---|------|----------|-------|
| 8.1 | `GITHUB_ACTIONS=true` | Detected as GitHub Actions | |
| 8.2 | `GITHUB_BASE_REF` set | Base branch inferred from env var | |

---

## Quick Validation Workflow

For fast iteration, use this minimal workflow:

```yaml
name: OpenLens Quick Test
on: [pull_request]

permissions:
  contents: read
  pull-requests: write
  security-events: write

jobs:
  review:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0
      - uses: Traves-Theberge/OpenLens@main
        with:
          mode: branch
          base-branch: ${{ github.base_ref }}
          comment-on-pr: "true"
          inline-comments: "true"
          auto-resolve: "true"
          upload-sarif: "true"
          fail-on-critical: "true"
```
