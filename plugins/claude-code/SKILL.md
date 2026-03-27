---
name: openlens
description: Run openlens AI code review on current changes
---

Run an openlens code review on your current git changes.

## Usage

- `/openlens` — review staged changes (default)
- `/openlens --unstaged` — review unstaged changes
- `/openlens --branch main` — review diff against a branch
- `/openlens --agents security,bugs` — run specific agents only
- `/openlens --no-verify` — skip verification pass

## How to execute

Run the `openlens` CLI with the user's flags:

```
openlens run --staged --format text
```

If the user provides flags (e.g., `--unstaged`, `--branch main`), pass them through.

Show the full output to the user. If issues are found, offer to help fix them.
