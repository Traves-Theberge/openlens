---
description: Run local code review with OpenReview
---

Run a local code review using OpenReview. Execute the following command:

```bash
openreview run --staged
```

Display the results to the user exactly as output by the tool.

If the user specified flags, pass them through:
- "review against main" → `openreview run --branch main`
- "just check security" → `openreview run --agents security`
- "review everything" → `openreview run --unstaged`
- "json output" → `openreview run --format json`

Arguments: $ARGUMENTS
