---
name: using-openlens
description: Guide for using the openlens CLI tool for AI-powered code review. Use when asked to review code, check for security issues, run openlens, or set up code review.
---

## openlens CLI Reference

### Quick Start
```bash
openlens setup          # interactive project setup
openlens run --staged   # review staged changes
openlens doctor         # check environment
```

### Review Commands
```bash
openlens run --staged                    # review staged changes
openlens run --unstaged                  # review working tree
openlens run --branch main               # review branch diff
openlens run --agents security,bugs      # specific agents only
openlens run --format json               # json output
openlens run --format sarif              # sarif for CI
openlens run --no-verify                 # skip verification pass
openlens run --dry-run                   # preview without API calls
```

### Agent Management
```bash
openlens agent list                      # show all agents
openlens agent validate                  # check agent configs
openlens agent create <name>             # create custom agent
openlens agent test <name> --staged      # test single agent
openlens agent enable <name>             # enable agent
openlens agent disable <name>            # disable agent
```

### Setup & Configuration
```bash
openlens setup                           # full interactive wizard
openlens setup --yes                     # accept all defaults
openlens setup --config                  # just config
openlens setup --hooks                   # just git hooks
openlens setup --plugins                 # just platform plugins
openlens setup --ci                      # just CI/CD workflow
openlens init                            # quick init (config + agents)
```

### Hooks
```bash
openlens hooks install                   # install pre-commit + pre-push
openlens hooks remove                    # remove hooks
OPENLENS_SKIP=1 git commit -m "wip"     # skip hooks once
OPENLENS_AGENTS=security git commit      # customize hook agents
```

### Other Commands
```bash
openlens doctor                          # check environment
openlens models                          # list available models
openlens serve --port 5555               # start HTTP API
openlens docs                            # open wiki in browser
```

### Exit Codes
- 0: no critical issues
- 1: critical issues found
- 2: runtime error

### Output Formats
- `text` (default): colorized terminal output
- `json`: structured data for programmatic use
- `sarif`: for GitHub Code Scanning / GitLab SAST
- `markdown`: GitHub-flavored markdown
