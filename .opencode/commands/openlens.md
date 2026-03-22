---
description: Run local code review with OpenLens
---

Run a local code review using the OpenLens plugin tool. Call the `openlens` tool directly.

If the user specified flags, pass them as arguments:
- "review against main" → `openlens({ mode: "branch", branch: "main" })`
- "just check security" → `openlens({ agents: "security" })`
- "review everything" → `openlens({ mode: "unstaged" })`
- "skip verification" → `openlens({ verify: false })`

Display the results to the user exactly as output by the tool.

Arguments: $ARGUMENTS
