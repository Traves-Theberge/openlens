import { type Plugin, tool } from "@opencode-ai/plugin"
import { runReview, runSingleAgentReview } from "./session/review.js"
import { loadConfig, loadInstructions } from "./config/config.js"
import { loadAgents, filterAgents } from "./agent/agent.js"
import { formatText } from "./output/format.js"

const plugin: Plugin = async (ctx) => {
  const directory = ctx.directory

  return {
    // Register tools
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

      // Delegation tool — lets a primary agent ask a specialist to review specific code
      "openlens-delegate": tool({
        description:
          "Delegate a focused review question to a specialist agent. " +
          "Use this when you want a specific agent (security, bugs, performance, etc.) " +
          "to analyze a particular file or code pattern.",
        args: {
          agent: tool.schema
            .string()
            .describe("Name of the agent to delegate to (e.g. 'security', 'bugs')"),
          question: tool.schema
            .string()
            .describe("Specific question or focus area for the agent"),
          files: tool.schema
            .string()
            .optional()
            .describe("Comma-separated file paths to focus on"),
        },
        async execute(args) {
          const config = await loadConfig(directory)
          const agents = await loadAgents(config, directory)
          const target = agents.find((a) => a.name === args.agent)

          if (!target) {
            const available = agents.map((a) => a.name).join(", ")
            return `Agent '${args.agent}' not found. Available: ${available}`
          }

          try {
            const result = await runSingleAgentReview(
              config,
              target,
              {
                question: args.question,
                files: args.files?.split(",").map((f) => f.trim()),
              },
              directory
            )
            return formatText(result)
          } catch (err: any) {
            return `Delegation to '${args.agent}' failed: ${err.message}`
          }
        },
      }),

      // Conventions tool — retrieves project review instructions
      "openlens-conventions": tool({
        description:
          "Get this project's review conventions and instructions (from REVIEW.md and config). " +
          "Use this to understand project-specific rules before reviewing.",
        args: {},
        async execute() {
          const config = await loadConfig(directory)
          const instructions = await loadInstructions(
            config.review.instructions,
            directory
          )

          if (!instructions.trim()) {
            return "No project review instructions found. Check for a REVIEW.md file or configure review.instructions in openlens.json."
          }

          return instructions
        },
      }),

      // Agent list tool — discover available agents and their capabilities
      "openlens-agents": tool({
        description:
          "List all available review agents and their capabilities. " +
          "Use this to understand what specialists are available for delegation.",
        args: {},
        async execute() {
          const config = await loadConfig(directory)
          const agents = await loadAgents(config, directory)

          const lines = agents.map((a) => {
            const tools = Object.entries(a.permission)
              .filter(([_, v]) => v === "allow")
              .map(([k]) => k)
              .join(", ")
            return `- **${a.name}**: ${a.description || "No description"} (model: ${a.model}, tools: ${tools}, steps: ${a.steps})`
          })

          return `## Available Agents\n\n${lines.join("\n")}`
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
