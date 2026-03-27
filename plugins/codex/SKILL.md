---
name: openlens
description: 'Run AI-powered code review on current changes using openlens. Use when developers: (1) Want to review staged, unstaged, or branch changes for security, bugs, performance, or style issues, (2) Ask to "review my code", "check for vulnerabilities", "run openlens", or "code review". Triggers on: "openlens", "code review", "review my changes", "check for bugs", "security scan", "review staged".'
---

## How to run

Execute the `openlens` CLI to review code changes. The tool must be installed and available in PATH.

### Default (staged changes)
```bash
openlens run --staged --format text
```

### With user flags
- "review against main" → `openlens run --branch main --format text`
- "just check security" → `openlens run --staged --agents security --format text`
- "review unstaged" → `openlens run --unstaged --format text`
- "skip verification" → `openlens run --staged --no-verify --format text`
- "json output" → `openlens run --staged --format json`

### What it does
openlens runs multiple AI agents in parallel (security, bugs, performance, style) that analyze git diffs with full codebase access. Each agent investigates the code using read, grep, and glob tools before reporting issues with confidence levels.

### Reading results
- **CRITICAL** — must fix before merging
- **WARNING** — should fix, potential problems
- **INFO** — style or convention suggestions
- Each issue includes file, line, severity, confidence, message, and suggested fix

Show the full output to the user. If issues are found, offer to help fix them.
