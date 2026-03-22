import { type Plugin, tool } from "@opencode-ai/plugin"
import { runReview } from "./session/review.js"
import { loadConfig } from "./config/config.js"
import { filterAgents } from "./agent/agent.js"
import { formatText } from "./output/format.js"

const plugin: Plugin = async () => {
  return {
    tool: {
      openreview: tool({
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
          const cwd = process.cwd()
          let config = await loadConfig(cwd)

          config = filterAgents(config, args.agents)

          if (args.branch) config.review.baseBranch = args.branch
          if (args.verify === false) config.review.verify = false

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
