import { tool } from "@opencode-ai/plugin"

export default tool({
  description: "Run code review on current changes with specialized agents",
  args: {
    mode: tool.schema
      .enum(["staged", "unstaged", "branch"])
      .optional()
      .describe("What to review (default: staged)"),
    agents: tool.schema
      .string()
      .optional()
      .describe("Comma-separated agent names (default: all enabled)"),
    branch: tool.schema
      .string()
      .optional()
      .describe("Base branch for branch mode"),
    format: tool.schema
      .enum(["text", "json"])
      .optional()
      .describe("Output format (default: text)"),
  },
  async execute(args, ctx) {
    const flags = [`--${args.mode || "staged"}`]
    if (args.agents) flags.push("--agents", args.agents)
    if (args.branch) flags.push("--branch", args.branch)
    flags.push("--format", args.format || "text")

    const result = Bun.spawnSync(["openreview", "run", ...flags], {
      cwd: ctx.directory,
    })

    const stdout = new TextDecoder().decode(result.stdout)
    const stderr = new TextDecoder().decode(result.stderr)

    if (result.exitCode !== 0 && result.exitCode !== 1) {
      return `Error running openreview: ${stderr}`
    }

    return stdout
  },
})
