import * as p from "@clack/prompts"
import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import type { SetupOptions } from "./index.js"

const BUILT_IN_AGENTS = [
  { value: "security", label: "security", hint: "Vulnerabilities & secrets" },
  { value: "bugs", label: "bugs", hint: "Logic errors & edge cases" },
  {
    value: "performance",
    label: "performance",
    hint: "N+1 queries, bottlenecks",
  },
  { value: "style", label: "style", hint: "Conventions & dead code" },
]

export async function setupAgents(
  cwd: string,
  config: any,
  options: SetupOptions,
) {
  p.log.step("Agents")

  const agentsDir = path.join(cwd, "agents")
  await fs.mkdir(agentsDir, { recursive: true })

  // Select which agents to enable
  let selectedAgents = ["security", "bugs", "performance", "style"]
  if (!options.yes) {
    const selected = await p.multiselect({
      message: "Which agents do you want to enable?",
      options: BUILT_IN_AGENTS,
      initialValues: ["security", "bugs", "performance", "style"],
      required: true,
    })
    if (p.isCancel(selected)) {
      p.cancel("Setup cancelled.")
      process.exit(0)
    }
    selectedAgents = selected as string[]
  }

  // Copy agent files from the bundled agents directory
  const srcAgentsDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../agents",
  )

  for (const name of selectedAgents) {
    const dst = path.join(agentsDir, `${name}.md`)
    try {
      await fs.access(dst)
      p.log.info(`agents/${name}.md already exists`)
    } catch {
      try {
        const content = await fs.readFile(
          path.join(srcAgentsDir, `${name}.md`),
          "utf-8",
        )
        await fs.writeFile(dst, content)
        p.log.success(`Created agents/${name}.md`)
      } catch {
        p.log.warn(`Could not copy agents/${name}.md template`)
      }
    }
  }

  // Offer to create a custom agent
  if (!options.yes) {
    const createCustom = await p.confirm({
      message: "Create a custom agent?",
      initialValue: false,
    })
    if (p.isCancel(createCustom)) {
      p.cancel("Setup cancelled.")
      process.exit(0)
    }

    if (createCustom) {
      const name = await p.text({
        message: "Agent name (lowercase, hyphens ok):",
        placeholder: "api-review",
        validate: (v) => {
          if (!v || !/^[a-z][a-z0-9-]*$/.test(v)) {
            return "Lowercase alphanumeric with hyphens"
          }
        },
      })
      if (p.isCancel(name)) {
        p.cancel("Setup cancelled.")
        process.exit(0)
      }

      const desc = await p.text({
        message: "What does this agent review?",
        placeholder: "API design and REST conventions",
        validate: (v) => {
          if (!v || !v.trim()) {
            return "Description must not be empty"
          }
        },
      })
      if (p.isCancel(desc)) {
        p.cancel("Setup cancelled.")
        process.exit(0)
      }

      const agentContent = `---
description: ${desc}
mode: subagent
model: ${config?.model || "opencode/big-pickle"}
steps: 5
permission:
  read: allow
  grep: allow
  glob: allow
  list: allow
  edit: deny
  write: deny
  bash: deny
---

You are a ${(name as string).replace(/-/g, " ")}-focused code reviewer with access to the full codebase.

## How to review

1. **Classify** each changed file/function: new code, modified logic, refactor, or config
2. **Filter** to changes relevant to your focus area
3. **Investigate** using tools - read full files, grep for patterns, check callers
4. **Assess** each finding with a confidence level (high/medium/low)
5. Only report issues you can confirm by reading the actual code

## What to look for

<!-- Add your review criteria here -->

## Output

**IMPORTANT:** The \`severity\` field MUST be exactly one of: \`"critical"\`, \`"warning"\`, or \`"info"\`.

Return a JSON array of issues:

\`\`\`json
[
  {
    "file": "src/example.ts",
    "line": 42,
    "severity": "warning",
    "confidence": "high",
    "title": "Brief issue title",
    "message": "Detailed explanation.",
    "fix": "How to fix it"
  }
]
\`\`\`

If no issues found, return \`[]\`
`

      const agentPath = path.join(agentsDir, `${name}.md`)
      await fs.writeFile(agentPath, agentContent)
      p.log.success(`Created agents/${name}.md`)

      // Update config
      if (config?.agent) {
        config.agent[name as string] = {
          description: desc as string,
          prompt: `{file:./agents/${name}.md}`,
        }
        const configPath = path.join(cwd, "openlens.json")
        await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n")
        p.log.success("Updated openlens.json")
      }
    }
  }
}
