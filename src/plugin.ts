import { type Plugin, tool } from "@opencode-ai/plugin"
import { runReview } from "./session/review.js"
import { loadConfig } from "./config/config.js"
import { filterAgents } from "./agent/agent.js"
import { formatText } from "./output/format.js"

const plugin: Plugin = async (ctx) => {
  const directory = ctx.directory

  return {
    // Register the openlens tool
    tool: {
      openlens: tool({
        description:
          "Run local code review on current changes with specialized agents that can read, grep, and explore the codebase",
        args: {
          mode: tool.schema
            .enum(["staged", "unstaged", "branch", "auto"])
            .optional()
            .describe("What to review (default: staged)"),
          agents: tool.schema
            .string()
            .optional()
            .describe("Comma-separated agent names (default: all enabled)"),
          branch: tool.schema
            .string()
            .optional()
            .describe("Base branch for branch mode (default: main)"),
          verify: tool.schema
            .boolean()
            .optional()
            .describe("Run verification pass (default: true)"),
        },
        async execute(args) {
          let config = await loadConfig(directory)

          config = filterAgents(config, args.agents)

          if (args.branch) config.review.baseBranch = args.branch
          if (args.verify === false) config.review.verify = false

          const result = await runReview(config, args.mode || "staged", directory)
          return formatText(result)
        },
      }),
    },

    // Auto-approve read-only tools for openlens sessions
    "permission.ask": async (input, output) => {
      const meta = input as any
      const title = meta?.metadata?.title || meta?.title || ""
      if (typeof title !== "string" || !title.startsWith("openlens-")) return

      const readOnlyTools = new Set([
        "read", "grep", "glob", "list", "view", "find", "diagnostics",
      ])

      const toolName = String(meta?.metadata?.tool || meta?.tool || "")
      if (readOnlyTools.has(toolName)) {
        output.status = "allow"
      }
    },

    // Set temperature for review agents — deterministic by default
    "chat.params": async (input, output) => {
      const sessionTitle = String(
        (input.message as any)?.summary?.title || ""
      )
      if (!sessionTitle.startsWith("openlens-")) return

      if (output.temperature === undefined || output.temperature > 0.2) {
        output.temperature = 0
      }
    },
  }
}

export default plugin
