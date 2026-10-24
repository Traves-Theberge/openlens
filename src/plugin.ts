import { type Plugin as PluginV1, tool } from "@opencode-ai/plugin"
import { Plugin as PluginV2 } from "@opencode/plugin"
import { runReview, runSingleAgentReview } from "./session/review.js"
import { loadConfig, loadInstructions } from "./config/config.js"
import { loadAgents, filterAgents } from "./agent/agent.js"
import { formatText } from "./output/format.js"

interface PluginContext {
  directory?: string
  location?: { directory?: string }
}

interface PermissionMetadata {
  title?: string
  tool?: string
}

interface HookEvent {
  metadata?: PermissionMetadata
  title?: string
  tool?: string
  action?: string
  status?: string
  effect?: string
  session?: { title?: string }
  options?: { temperature?: number }
  message?: { summary?: { title?: string } }
}

const READ_ONLY_TOOLS: Record<string, true> = {
  read: true,
  grep: true,
  glob: true,
  list: true,
  lsp: true,
  skill: true,
  view: true,
  find: true,
  diagnostics: true,
}

const plugin: PluginV1 & { id: string; setup: (ctx: PluginV2.Context) => Promise<void> } = Object.assign(
  async (ctx: PluginContext) => {
    const directory = ctx.directory || ctx.location?.directory || process.cwd()

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
            } catch (err: unknown) {
              const message = err instanceof Error ? err.message : String(err)
              return `Delegation to '${args.agent}' failed: ${message}`
            }
          },
        }),

        // Conventions tool — retrieves project review instructions
        "openlens-conventions": tool({
          description:
            "Get this project's review conventions and instructions (from AGENTS.md, CLAUDE.md, REVIEW.md, and config). " +
            "Use this to understand project-specific rules before reviewing.",
          args: {},
          async execute() {
            const config = await loadConfig(directory)
            const instructions = await loadInstructions(
              config.review.instructions,
              directory,
              config.review.rules
            )

            if (!instructions.trim()) {
              return "No project review instructions found. Check for AGENTS.md, CLAUDE.md, or REVIEW.md files, or configure review.instructions in openlens.json."
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
      "permission.ask": async (input: unknown, output: { status?: string }) => {
        const meta = input as HookEvent | undefined
        const title = meta?.metadata?.title || meta?.title || ""
        if (typeof title !== "string" || !title.startsWith("openlens-")) return

        const toolName = String(meta?.metadata?.tool || meta?.tool || "")
        if (READ_ONLY_TOOLS[toolName]) {
          output.status = "allow"
        }
      },

      // Set temperature for review agents — deterministic by default
      "chat.params": async (input: unknown, output: { temperature?: number }) => {
        const chatInput = input as HookEvent | undefined
        const sessionTitle = String(
          chatInput?.message?.summary?.title || ""
        )
        if (!sessionTitle.startsWith("openlens-")) return

        if (output.temperature === undefined || output.temperature > 0.2) {
          output.temperature = 0
        }
      },
    }
  },
  {
    id: "openlens",
    async setup(ctx: PluginV2.Context) {
      const directory = ctx.location?.directory || process.cwd()

      if (ctx.tool?.transform) {
        await ctx.tool.transform((editor) => {
          editor.add({
            name: "openlens",
            description:
              "Run local code review on current changes with specialized agents that can read, grep, and explore the codebase",
            input: {
              type: "object",
              properties: {
                mode: { type: "string", enum: ["staged", "unstaged", "branch", "auto"], description: "What to review (default: staged)" },
                agents: { type: "string", description: "Comma-separated agent names (default: all enabled)" },
                branch: { type: "string", description: "Base branch for branch mode (default: main)" },
                verify: { type: "boolean", description: "Run verification pass (default: true)" },
              },
            },
            async execute(args: any) {
              let config = await loadConfig(directory)
              config = filterAgents(config, args.agents)
              if (args.branch) config.review.baseBranch = args.branch
              if (args.verify === false) config.review.verify = false
              const result = await runReview(config, args.mode || "staged", directory)
              return { content: formatText(result) }
            },
          })

          editor.add({
            name: "openlens-delegate",
            description: "Delegate a focused review question to a specialist agent.",
            input: {
              type: "object",
              properties: {
                agent: { type: "string", description: "Name of the agent to delegate to" },
                question: { type: "string", description: "Specific question or focus area" },
                files: { type: "string", description: "Comma-separated file paths to focus on" },
              },
              required: ["agent", "question"],
            },
            async execute(args: any) {
              const config = await loadConfig(directory)
              const agents = await loadAgents(config, directory)
              const target = agents.find((a) => a.name === args.agent)
              if (!target) {
                const available = agents.map((a) => a.name).join(", ")
                return { content: `Agent '${args.agent}' not found. Available: ${available}` }
              }
              try {
                const result = await runSingleAgentReview(
                  config,
                  target,
                  {
                    question: args.question,
                    files: args.files?.split(",").map((f: string) => f.trim()),
                  },
                  directory
                )
                return { content: formatText(result) }
              } catch (err: any) {
                return { content: `Delegation to '${args.agent}' failed: ${err.message}` }
              }
            },
          })

          editor.add({
            name: "openlens-conventions",
            description: "Get this project's review conventions and instructions.",
            input: { type: "object", properties: {} },
            async execute() {
              const config = await loadConfig(directory)
              const instructions = await loadInstructions(
                config.review.instructions,
                directory,
                config.review.rules
              )
              return { content: instructions.trim() || "No project review instructions found." }
            },
          })

          editor.add({
            name: "openlens-agents",
            description: "List all available review agents and their capabilities.",
            input: { type: "object", properties: {} },
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
              return { content: `## Available Agents\n\n${lines.join("\n")}` }
            },
          })
        })
      }

      if (ctx.permission?.hook) {
        await ctx.permission.hook("evaluate", (event) => {
          const raw = event as unknown as HookEvent
          const title = raw?.session?.title || raw?.metadata?.title || ""
          if (typeof title === "string" && title.startsWith("openlens-")) {
            const toolName = String(raw?.tool || raw?.action || "")
            if (READ_ONLY_TOOLS[toolName]) {
              raw.effect = "allow"
            }
          }
        })
      }

      if (ctx.session?.hook) {
        await ctx.session.hook("context", (event) => {
          const raw = event as unknown as HookEvent
          const title = raw?.session?.title || ""
          if (title.startsWith("openlens-") && raw?.options) {
            if (raw.options.temperature === undefined || raw.options.temperature > 0.2) {
              raw.options.temperature = 0
            }
          }
        })
      }
    },
  }
)

export default plugin
