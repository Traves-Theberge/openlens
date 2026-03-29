import * as p from "@clack/prompts"
import fs from "fs/promises"
import path from "path"
import type { SetupOptions } from "./index.js"

export async function setupConfig(cwd: string, options: SetupOptions) {
  p.log.step("Configuration")

  // Check for existing config
  const configPath = path.join(cwd, "openlens.json")
  let existing = false
  try {
    await fs.access(configPath)
    existing = true
  } catch {}

  if (existing && !options.yes) {
    const overwrite = await p.confirm({
      message: "openlens.json already exists. Overwrite?",
      initialValue: false,
    })
    if (p.isCancel(overwrite)) {
      p.cancel("Setup cancelled.")
      process.exit(0)
    }
    if (!overwrite) {
      p.log.info("Keeping existing config.")
      const raw = await fs.readFile(configPath, "utf-8")
      return JSON.parse(raw)
    }
  }

  // Model selection
  let model = "opencode/big-pickle"
  if (!options.yes) {
    const modelChoice = await p.select({
      message: "Which model do you want to use?",
      options: [
        {
          value: "opencode/big-pickle",
          label: "opencode/big-pickle",
          hint: "free, no API key",
        },
        {
          value: "opencode/gpt-5-nano",
          label: "opencode/gpt-5-nano",
          hint: "free, fast",
        },
        {
          value: "anthropic/claude-sonnet-4-20250514",
          label: "anthropic/claude-sonnet-4-20250514",
          hint: "requires API key",
        },
        {
          value: "openai/gpt-4o",
          label: "openai/gpt-4o",
          hint: "requires API key",
        },
        { value: "custom", label: "Custom model..." },
      ],
    })
    if (p.isCancel(modelChoice)) {
      p.cancel("Setup cancelled.")
      process.exit(0)
    }

    if (modelChoice === "custom") {
      const custom = await p.text({
        message: "Enter model ID (provider/model):",
        placeholder: "anthropic/claude-sonnet-4-20250514",
        validate: (v) => {
          if (!v || !v.trim()) {
            return "Model ID must not be empty"
          }
          if (!v.includes("/")) {
            return "Model ID must be in provider/model format (e.g. anthropic/claude-sonnet-4-20250514)"
          }
        },
      })
      if (p.isCancel(custom)) {
        p.cancel("Setup cancelled.")
        process.exit(0)
      }
      model = custom as string
    } else {
      model = modelChoice as string
    }
  }

  // Review settings
  let defaultMode = "staged"
  let minConfidence = "medium"
  let verify = true

  if (!options.yes) {
    const mode = await p.select({
      message: "Default diff mode?",
      options: [
        { value: "staged", label: "staged", hint: "review git add changes" },
        {
          value: "unstaged",
          label: "unstaged",
          hint: "review working tree changes",
        },
        { value: "branch", label: "branch", hint: "review full branch diff" },
        {
          value: "auto",
          label: "auto",
          hint: "try staged, then unstaged, then branch",
        },
      ],
    })
    if (p.isCancel(mode)) {
      p.cancel("Setup cancelled.")
      process.exit(0)
    }
    defaultMode = mode as string

    const conf = await p.select({
      message: "Minimum confidence to report issues?",
      options: [
        { value: "low", label: "low", hint: "report everything" },
        { value: "medium", label: "medium", hint: "recommended" },
        {
          value: "high",
          label: "high",
          hint: "only high-confidence findings",
        },
      ],
      initialValue: "medium",
    })
    if (p.isCancel(conf)) {
      p.cancel("Setup cancelled.")
      process.exit(0)
    }
    minConfidence = conf as string

    const v = await p.confirm({
      message: "Enable verification pass? (filters false positives)",
      initialValue: true,
    })
    if (p.isCancel(v)) {
      p.cancel("Setup cancelled.")
      process.exit(0)
    }
    verify = v as boolean
  }

  const config = {
    $schema: "https://openlens.dev/config.json",
    model,
    agent: {
      security: {
        description: "Security vulnerability scanner",
        prompt: "{file:./agents/security.md}",
      },
      bugs: {
        description: "Bug and logic error detector",
        prompt: "{file:./agents/bugs.md}",
      },
      performance: {
        description: "Performance issue finder",
        prompt: "{file:./agents/performance.md}",
      },
      style: {
        description: "Style and convention checker",
        prompt: "{file:./agents/style.md}",
      },
    },
    review: {
      defaultMode,
      instructions: ["REVIEW.md"],
      fullFileContext: true,
      verify,
      minConfidence,
    },
  }

  await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n")
  p.log.success("Created openlens.json")

  return config
}
