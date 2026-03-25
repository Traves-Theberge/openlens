---
name: review
description: Run OpenLens AI code review on current changes
---

Run an OpenLens code review on your current git changes.

## Usage

- `/review` — review staged changes (default)
- `/review --unstaged` — review unstaged changes
- `/review --branch main` — review diff against a branch
- `/review --agents security,bugs` — run specific agents only
- `/review --no-verify` — skip verification pass

## How to execute

Run the `openlens` CLI with the user's flags:

```
openlens run --staged --format text
```

If the user provides flags (e.g., `--unstaged`, `--branch main`), pass them through.

Show the full output to the user. If issues are found, offer to help fix them.
