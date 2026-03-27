# Using openlens in CI/CD Pipelines

## Overview

openlens auto-detects CI environments and adjusts its behavior accordingly. When running inside a CI pipeline, it:

- **Defaults to `branch` mode** — diffs against the base branch rather than staged/unstaged changes
- **Auto-infers the base branch** from provider-specific environment variables (`GITHUB_BASE_REF`, `CI_MERGE_REQUEST_TARGET_BRANCH_NAME`, `BUILDKITE_PULL_REQUEST_BASE_BRANCH`)
- **Uses free models by default** — no API keys required for basic usage

Supported CI providers (detected automatically):

| Provider       | Detection variable         |
|----------------|---------------------------|
| GitHub Actions | `GITHUB_ACTIONS=true`     |
| GitLab CI      | `GITLAB_CI=true`          |
| CircleCI       | `CIRCLECI=true`           |
| Buildkite      | `BUILDKITE=true`          |
| Jenkins        | `JENKINS_URL` is set      |
| Travis CI      | `TRAVIS=true`             |

Any environment with `CI=true` or `CI=1` is also recognized as CI, even if the specific provider is unknown.

---

## GitHub Actions (Recommended Path)

### Quick Start

The minimal workflow to run openlens on every pull request:

```yaml
name: openlens PR Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write
  security-events: write

jobs:
  review:
    name: Code Review
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: Traves-Theberge/openlens@main
        with:
          mode: branch
          base-branch: ${{ github.base_ref }}
          comment-on-pr: "true"
          inline-comments: "true"
          upload-sarif: "true"
          fail-on-critical: "true"
```

> **Important:** `fetch-depth: 0` is required so openlens can diff against the base branch.

### What the Composite Action Does

The `action.yml` runs these steps in order:

1. **Setup Bun** — installs the Bun runtime via `oven-sh/setup-bun@v2`
2. **Install openlens** — runs `bun install --frozen-lockfile` in the action directory
3. **Verify OpenCode binary** — confirms the `opencode` binary exists in `node_modules/.bin/`
4. **Run openlens** — executes the review with your configured flags, writes SARIF output, parses issue counts with `jq`, and writes a GitHub Step Summary
5. **Upload SARIF** — sends results to GitHub Code Scanning via `github/codeql-action/upload-sarif@v3`
6. **Generate JSON review** — (if inline comments enabled) re-runs the review in JSON format for structured comment data
7. **Post PR Review** — submits a GitHub pull request review with inline comments, handles auto-resolve of previously fixed issues

### All Inputs

| Input | Default | Description |
|-------|---------|-------------|
| `mode` | `branch` | Review mode: `staged`, `unstaged`, `branch`, `auto` |
| `agents` | _(all)_ | Comma-separated agent names (e.g., `security,performance`) |
| `format` | `sarif` | Output format: `text`, `json`, `sarif`, `markdown` |
| `base-branch` | `main` | Base branch for branch-mode diff |
| `verify` | `true` | Run verification pass on findings |
| `config` | _(none)_ | Path to `openlens.json` config file |
| `upload-sarif` | `true` | Upload SARIF results to GitHub Code Scanning |
| `fail-on-critical` | `true` | Fail the workflow if critical issues are found |
| `comment-on-pr` | `false` | Post review results as a PR comment (pull_request events only) |
| `inline-comments` | `true` | Post inline review comments on specific lines (requires `comment-on-pr`) |
| `auto-resolve` | `true` | Strikethrough resolved comments on re-runs |
| `model` | _(opencode/big-pickle)_ | Override the LLM model. Use any OpenCode-supported model |
| `anthropic-api-key` | _(none)_ | Anthropic API key — only needed when using Anthropic models |
| `openai-api-key` | _(none)_ | OpenAI API key — only needed when using OpenAI models |

### All Outputs

| Output | Description |
|--------|-------------|
| `issues` | Total number of issues found |
| `critical` | Number of critical issues found |
| `sarif-file` | Path to the SARIF output file |

You can use these outputs in downstream steps:

```yaml
- uses: Traves-Theberge/openlens@main
  id: lens
  with:
    mode: branch
    base-branch: ${{ github.base_ref }}

- run: echo "Found ${{ steps.lens.outputs.issues }} issues (${{ steps.lens.outputs.critical }} critical)"
```

---

## Inline PR Comments

### Enabling

```yaml
- uses: Traves-Theberge/openlens@main
  with:
    comment-on-pr: "true"
    inline-comments: "true"
    base-branch: ${{ github.base_ref }}
```

Both `comment-on-pr` and `inline-comments` must be `"true"`. The workflow must have `pull-requests: write` permission.

### What Happens

When inline comments are enabled, openlens submits a **GitHub pull request review** with comments attached to specific lines in the diff. Each comment includes:

- Severity level (CRITICAL, WARNING, INFO)
- Issue title and description
- Suggested fix (when available)
- Diff patch (when available)
- The agent that found the issue

### Severity Mapping

The review event type is determined by the highest severity found:

| Highest severity | Review event | Effect |
|-----------------|--------------|--------|
| Critical | `REQUEST_CHANGES` | Blocks merge (if branch protection requires reviews) |
| Warning only | `COMMENT` | Informational, does not block |
| No issues | `APPROVE` | Approves the PR |

Previous `REQUEST_CHANGES` reviews from openlens are automatically dismissed when a new review is submitted, preventing stale blocks.

---

## Incremental Updates

### Enabling

```yaml
- uses: Traves-Theberge/openlens@main
  with:
    comment-on-pr: "true"
    inline-comments: "true"
    auto-resolve: "true"    # this is the default
    base-branch: ${{ github.base_ref }}
```

### What Happens on Re-push

When a developer pushes new commits to the PR:

1. **Resolved issues** get their comments updated with ~~strikethrough~~ text and a "Resolved in latest push." note
2. **New issues** are posted as fresh inline comments
3. **Remaining issues** stay as-is
4. The review summary shows progress: e.g., "openlens found **3 issue(s)** (2 resolved, 1 new, 2 remaining)"

### How Fingerprinting Works

Each issue gets a fingerprint computed as:

```
sha256(file + "\x00" + title + "\x00" + agent)  →  first 16 hex characters
```

The fingerprint is **line-number independent** — if you move code around without fixing the issue, it stays matched. Only the file path, issue title, and agent name matter.

### State Tracking

Fingerprints are stored in a hidden PR comment:

```html
<!-- openlens-review-state: <base64-encoded JSON> -->
```

This comment is created automatically and updated on each run. Do not edit or delete it.

---

## SARIF Integration

### Enabling

```yaml
- uses: Traves-Theberge/openlens@main
  with:
    upload-sarif: "true"    # this is the default
    format: sarif           # this is the default
```

The workflow must have `security-events: write` permission.

### What Happens

openlens generates a SARIF file and uploads it to GitHub Code Scanning via `github/codeql-action/upload-sarif@v3` with the category `openlens`. The upload step uses `continue-on-error: true`, so a failed upload will not break your workflow.

### Viewing Results

Navigate to your repository:

**Repository > Security > Code scanning alerts**

Alerts are tagged with the `openlens` category and include file location, severity, and description.

### Confidence in SARIF

SARIF results include confidence metadata:

- **`rank` field**: `10.0` (low), `50.0` (medium), `90.0` (high)
- **`properties.confidence`**: human-readable label (`low`, `medium`, `high`)

These values help you prioritize findings in the Code Scanning dashboard.

---

## GitLab CI

### Example `.gitlab-ci.yml`

```yaml
stages:
  - review

openlens:
  stage: review
  image: oven/bun:latest
  script:
    - bun install -g openlens
    - openlens run --branch --format sarif > gl-sast-report.json
  artifacts:
    reports:
      sast: gl-sast-report.json
  rules:
    - if: $CI_MERGE_REQUEST_IID
```

openlens auto-detects GitLab CI and reads `CI_MERGE_REQUEST_TARGET_BRANCH_NAME` for the base branch.

### Text Output Alternative

For a human-readable review in the job log:

```yaml
openlens:
  stage: review
  image: oven/bun:latest
  script:
    - bun install -g openlens
    - openlens run --branch --format text
  rules:
    - if: $CI_MERGE_REQUEST_IID
```

---

## Other CI Systems

### Generic Approach

Any CI system that can run shell commands can use openlens:

```bash
# 1. Install Bun (if not already available)
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"

# 2. Install openlens
bun install -g openlens

# 3. Run the review
openlens run --branch --format json > results.json
```

### Exit Codes

| Code | Meaning |
|------|---------|
| `0`  | Clean — no critical issues found |
| `1`  | Critical issues found |
| `2`  | Error — openlens failed to run |

Use exit codes to gate deployments:

```bash
openlens run --branch --format text
if [ $? -eq 1 ]; then
  echo "Critical issues found — blocking deployment"
  exit 1
fi
```

### CircleCI Example

```yaml
version: 2.1

jobs:
  review:
    docker:
      - image: oven/bun:latest
    steps:
      - checkout
      - run:
          name: Run openlens
          command: |
            bun install -g openlens
            openlens run --branch --format text

workflows:
  pr-review:
    jobs:
      - review
```

### Buildkite Example

```yaml
steps:
  - label: ":mag: openlens Review"
    command: |
      curl -fsSL https://bun.sh/install | bash
      export PATH="$$HOME/.bun/bin:$$PATH"
      bun install -g openlens
      openlens run --branch --format text
```

openlens reads `BUILDKITE_PULL_REQUEST_BASE_BRANCH` automatically for the base branch.

---

## Configuration in CI

### Model Selection

By default, openlens uses free models (`opencode/big-pickle`) that require no API keys. To use a paid provider model:

```yaml
# GitHub Actions
- uses: Traves-Theberge/openlens@main
  with:
    model: claude-sonnet-4-20250514
    anthropic-api-key: ${{ secrets.ANTHROPIC_API_KEY }}
```

```bash
# CLI
export ANTHROPIC_API_KEY="sk-ant-..."
openlens run --branch --model claude-sonnet-4-20250514
```

### Speed Tuning

For faster CI runs, disable the verification pass and context gathering:

```yaml
- uses: Traves-Theberge/openlens@main
  with:
    verify: "false"
```

```bash
# CLI equivalent
openlens run --branch --no-verify --no-context
```

The verification pass re-checks findings to reduce false positives. Disabling it trades accuracy for speed.

### Agent Selection

Run only specific agents to focus on what matters for your gate:

```yaml
# Security-only gate
- uses: Traves-Theberge/openlens@main
  with:
    agents: security
    fail-on-critical: "true"
```

```bash
# CLI
openlens run --branch --agents security
```

### Suppressing Noise

Commit a `.openlensignore` file to your repository to exclude files or patterns from review:

```gitignore
# Generated code
src/generated/**
**/*.gen.ts

# Vendored dependencies
vendor/**

# Test fixtures
test/fixtures/**

# Large data files
**/*.json
!package.json
```

This file follows `.gitignore` syntax and is respected in all environments.

---

## Advanced: Custom Workflows

### Pipe JSON to External Tools

Use `--format json` to get structured output you can process with any tool:

```bash
# Post critical issues to Slack
openlens run --branch --format json | jq '[.issues[] | select(.severity == "critical")]' | \
  curl -X POST -H 'Content-type: application/json' \
    -d @- "$SLACK_WEBHOOK_URL"
```

```bash
# Create Jira tickets for critical issues
openlens run --branch --format json | jq -c '.issues[] | select(.severity == "critical")' | \
  while read -r issue; do
    TITLE=$(echo "$issue" | jq -r '.title')
    FILE=$(echo "$issue" | jq -r '.file')
    curl -X POST "$JIRA_URL/rest/api/2/issue" \
      -H "Authorization: Bearer $JIRA_TOKEN" \
      -H "Content-Type: application/json" \
      -d "{\"fields\":{\"project\":{\"key\":\"$JIRA_PROJECT\"},\"summary\":\"[openlens] $TITLE in $FILE\",\"issuetype\":{\"name\":\"Bug\"}}}"
  done
```

### Library API in Node.js

For fully custom pipelines, use openlens as a library:

```typescript
import { run } from "openlens";

const results = await run({
  mode: "branch",
  baseBranch: "main",
  agents: ["security", "performance"],
  format: "json",
});

// Custom logic
for (const issue of results.issues) {
  if (issue.severity === "critical" && issue.agent === "security") {
    await notifySecurityTeam(issue);
  }
}

process.exit(results.issues.some(i => i.severity === "critical") ? 1 : 0);
```

### Combine with Other SARIF Tools

openlens SARIF output is standard and can be merged with other tools:

```yaml
steps:
  - uses: actions/checkout@v4
    with:
      fetch-depth: 0

  # Run openlens
  - uses: Traves-Theberge/openlens@main
    id: lens
    with:
      upload-sarif: "false"  # we'll upload manually after merging

  # Run another SARIF-producing tool
  - uses: returntocorp/semgrep-action@v1
    with:
      generateSarif: "1"

  # Merge and upload both SARIF files
  - name: Upload combined SARIF
    uses: github/codeql-action/upload-sarif@v3
    with:
      sarif_file: .
      category: combined-review
```
