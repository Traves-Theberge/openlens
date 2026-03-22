---
description: Run local code review with OpenReview
---

Run a local code review using the OpenReview plugin tool. Call the `openreview` tool directly.

If the user specified flags, pass them as arguments:
- "review against main" → `openreview({ mode: "branch", branch: "main" })`
- "just check security" → `openreview({ agents: "security" })`
- "review everything" → `openreview({ mode: "unstaged" })`
- "skip verification" → `openreview({ verify: false })`

Display the results to the user exactly as output by the tool.

Arguments: $ARGUMENTS
