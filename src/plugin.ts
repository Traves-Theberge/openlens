import { type Plugin, tool } from "@opencode-ai/plugin"
import { runReview } from "./session/review.js"
import { loadConfig } from "./config/config.js"
import { formatText } from "./output/format.js"

const plugin: Plugin = async (ctx) => {
  return {
    tool: {
      openreview: tool({
        description:
          "Run local code review on current changes with specialized agents",
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
            .describe("Base branch for branch mode (default: main)"),
        },
        async execute(args) {
          const cwd = process.cwd()
          const config = await loadConfig(cwd)

          // Filter agents if specified
          if (args.agents) {
            const requested = new Set(
              args.agents.split(",").map((s: string) => s.trim())
            )
            for (const name of Object.keys(config.agent)) {
              if (!requested.has(name)) {
                config.agent[name] = {
                  ...config.agent[name],
                  enabled: false,
                }
              }
            }
          }

          if (args.branch) {
            config.review.baseBranch = args.branch
          }

          const result = await runReview(
            config,
            args.mode || "staged",
            cwd
          )
          return formatText(result)
        },
      }),
    },
  }
}

export default plugin
