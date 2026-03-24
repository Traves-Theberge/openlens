#!/usr/bin/env node
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { spawnSync } from "child_process"
import { fileURLToPath } from "url"
import { loadConfig } from "./config/config.js"
import { loadAgents, filterAgents, excludeAgents } from "./agent/agent.js"
import { runReview, runSingleAgentReview } from "./session/review.js"
import { formatText, formatJson, formatSarif, formatMarkdown } from "./output/format.js"
import { getDiff, getAutoDetectedDiff, getDiffStats } from "./tool/diff.js"
import { bus } from "./bus/index.js"
import matter from "gray-matter"
import fs from "fs/promises"
import path from "path"

const NO_COLOR = !!process.env.NO_COLOR
const B = NO_COLOR ? "" : "\x1b[1m"
const R = NO_COLOR ? "" : "\x1b[0m"
const D = NO_COLOR ? "" : "\x1b[2m"
const G = NO_COLOR ? "" : "\x1b[32m"
const YELLOW = NO_COLOR ? "" : "\x1b[33m"
const RD = NO_COLOR ? "" : "\x1b[31m"

function fatal(msg: string): never {
  console.error(`\n  ${RD}error${R}  ${msg}\n`)
  process.exit(2)
}

yargs(hideBin(process.argv))
  .scriptName("openlens")
  .usage("$0 <command> [options]")

  .command(
    "run",
    "Run code review",
    (y) =>
      y
        .option("staged", {
          type: "boolean",
          describe: "Review staged changes",
        })
        .option("unstaged", {
          type: "boolean",
          describe: "Review unstaged changes",
        })
        .option("branch", {
          type: "string",
          describe: "Review diff against branch",
        })
        .option("agents", {
          type: "string",
          describe: "Comma-separated agent list (whitelist)",
        })
        .option("exclude-agents", {
          type: "string",
          describe: "Comma-separated agents to skip",
        })
        .option("model", {
          alias: "m",
          type: "string",
          describe: "Override model for all agents (e.g. opencode/mimo-v2-pro-free)",
        })
        .option("format", {
          alias: "f",
          choices: ["text", "json", "sarif", "markdown"] as const,
          default: "text" as const,
          describe: "Output format",
        })
        .option("verify", {
          type: "boolean",
          default: true,
          describe: "Run verification pass (use --no-verify to skip)",
        })
        .option("context", {
          type: "boolean",
          default: true,
          describe: "Include full file context (use --no-context for diff only)",
        })
        .option("dry-run", {
          type: "boolean",
          describe: "Show what would run without making API calls",
        }),
    async (argv) => {
      const cwd = process.cwd()

      // Validate git repo
      const gitCheck = spawnSync("git", ["rev-parse", "--git-dir"], {
        cwd,
        encoding: "utf-8",
      })
      if (gitCheck.status !== 0) {
        fatal("Not a git repository. Run this from a git project root.")
      }

      let config
      try {
        config = await loadConfig(cwd)
      } catch (err: any) {
        fatal(`Config error: ${err.message}`)
      }

      // Apply CLI overrides
      config = filterAgents(config, argv.agents)
      if (argv.excludeAgents) {
        config = excludeAgents(config, argv.excludeAgents)
      }
      if (argv.model) {
        config.model = argv.model
        // Override all agents to use this model
        for (const agent of Object.values(config.agent)) {
          agent.model = argv.model
        }
      }

      if (argv.verify === false) config.review.verify = false
      if (argv.context === false) config.review.fullFileContext = false

      let mode: string
      if (argv.unstaged) {
        mode = "unstaged"
      } else if (argv.branch) {
        config.review.baseBranch = argv.branch
        mode = "branch"
      } else if (argv.staged) {
        mode = "staged"
      } else {
        mode = config.review.defaultMode
      }

      // Dry-run: show plan without making API calls
      if (argv.dryRun) {
        const agents = await loadAgents(config, cwd)
        const activeAgents = agents.filter(
          (a) => a.mode === "subagent" || a.mode === "all" || a.mode === "primary"
        )

        let diff: string
        try {
          if (mode === "auto") {
            const result = await getAutoDetectedDiff(config.review.baseBranch)
            diff = result.diff
            mode = result.mode
          } else {
            diff = await getDiff(mode as "staged" | "unstaged" | "branch", config.review.baseBranch)
          }
        } catch {
          diff = ""
        }

        const stats = diff.trim() ? getDiffStats(diff) : { filesChanged: 0, files: [] as string[] }

        console.log(`\n  ${B}OpenLens${R}  ${D}dry run${R}\n`)
        console.log(`  mode:     ${mode}`)
        console.log(`  files:    ${stats.filesChanged} changed`)
        if (stats.files.length > 0) {
          for (const f of stats.files.slice(0, 10)) {
            console.log(`            ${D}${f}${R}`)
          }
          if (stats.files.length > 10) {
            console.log(`            ${D}... and ${stats.files.length - 10} more${R}`)
          }
        }

        console.log(`  agents:   ${activeAgents.length}`)
        for (const agent of activeAgents) {
          const tools = Object.entries(agent.permission)
            .filter(([_, v]) => v === "allow")
            .map(([k]) => k)
            .join(", ")
          console.log(`            ${B}${agent.name}${R} ${D}(${agent.model}, ${agent.steps} steps)${R}`)
          console.log(`            ${D}tools: ${tools}${R}`)
        }

        const mcpNames = Object.entries(config.mcp)
          .filter(([_, v]) => v.enabled)
          .map(([k]) => k)
        if (mcpNames.length > 0) {
          console.log(`  mcp:      ${mcpNames.join(", ")}`)
        }

        console.log(`  verify:   ${config.review.verify}`)
        console.log(`  context:  ${config.review.fullFileContext ? "full files" : "diff only"}`)
        console.log(`  timeout:  ${config.review.timeoutMs / 1000}s`)
        console.log(`  output:   ${argv.format}`)

        if (!diff.trim()) {
          console.log(`\n  ${D}No changes to review.${R}\n`)
        } else {
          console.log(`\n  ${D}Ready to review. Remove --dry-run to execute.${R}\n`)
        }

        process.exit(0)
      }

      // Progress output for text mode
      if (argv.format === "text") {
        bus.subscribe("review.started", (evt) => {
          console.log(
            `\n  ${B}OpenLens${R}  Reviewing ${mode} changes (${evt.agents.length} agents)...\n`
          )
        })
        bus.subscribe("agent.started", (evt) => {
          process.stdout.write(`  ${D}●${R} ${evt.name}  reviewing...\n`)
        })
        bus.subscribe("agent.completed", (evt) => {
          console.log(
            `  ${G}✓${R} ${evt.name}  ${evt.issueCount} issues (${(evt.time / 1000).toFixed(1)}s)`
          )
        })
        bus.subscribe("agent.failed", (evt) => {
          console.log(`  ${RD}✗${R} ${evt.name}  ${evt.error}`)
        })
      }

      try {
        const result = await runReview(config, mode, cwd)

        switch (argv.format) {
          case "json":
            console.log(formatJson(result))
            break
          case "sarif":
            console.log(formatSarif(result))
            break
          case "markdown":
            console.log(
              formatMarkdown(result, {
                repo: process.env.GITHUB_REPOSITORY,
                sha: process.env.GITHUB_SHA,
              })
            )
            break
          default:
            console.log(formatText(result))
        }

        const hasCritical = result.issues.some(
          (i) => i.severity === "critical"
        )
        process.exit(hasCritical ? 1 : 0)
      } catch (err: any) {
        fatal(err.message)
      }
    }
  )

  .command("agent", "Manage review agents", (y) =>
    y
      .command(
        "list",
        "List configured review agents",
        (yy) => yy,
        async () => {
          let config
          try {
            config = await loadConfig(process.cwd())
          } catch (err: any) {
            fatal(`Config error: ${err.message}`)
          }

          const agents = await loadAgents(config, process.cwd())

          console.log(`\n  ${B}OpenLens Agents${R}\n`)
          for (const agent of agents) {
            const allowed = Object.entries(agent.permission)
              .filter(([_, v]) => v === "allow")
              .map(([k]) => k)
              .join(", ")

            console.log(
              `  ${B}${agent.name}${R}  ${D}${agent.description || ""}${R}`
            )
            console.log(`    model: ${agent.model}`)
            console.log(`    mode: ${D}${agent.mode}${R}`)
            console.log(`    allowed: ${D}${allowed || "none"}${R}`)
            console.log(`    steps: ${agent.steps}`)
            console.log("")
          }

          if (agents.length === 0) {
            console.log(`  No agents configured.\n`)
          }
        }
      )

      .command(
        "create <name>",
        "Create a new review agent",
        (yy) =>
          yy
            .positional("name", {
              type: "string",
              describe: "Agent name (e.g. accessibility, api-review)",
              demandOption: true,
            })
            .option("description", {
              type: "string",
              describe: "Agent description",
            })
            .option("model", {
              type: "string",
              describe: "Model to use (e.g. opencode/mimo-v2-pro-free)",
            })
            .option("steps", {
              type: "number",
              default: 5,
              describe: "Max agentic loop iterations",
            }),
        async (argv) => {
          const cwd = process.cwd()
          const name = argv.name as string

          // Validate name
          if (!/^[a-z][a-z0-9-]*$/.test(name)) {
            fatal("Agent name must be lowercase alphanumeric with hyphens (e.g. 'api-review')")
          }

          const agentsDir = path.join(cwd, "agents")
          const agentPath = path.join(agentsDir, `${name}.md`)

          const description = argv.description || `${name} code reviewer`
          const model = argv.model || "opencode/mimo-v2-pro-free"
          const steps = argv.steps || 5

          // Generate agent prompt file with frontmatter
          const agentContent = `---
description: ${description}
mode: subagent
model: ${model}
steps: ${steps}
permission:
  read: allow
  grep: allow
  glob: allow
  list: allow
  edit: deny
  write: deny
  bash: deny
---

You are a ${name.replace(/-/g, " ")}-focused code reviewer with access to the full codebase.

## How to review

1. Read the diff carefully to understand what changed
2. Use \`read\` to view full files for context
3. Use \`grep\` to find related patterns and callers
4. Use \`glob\` to find related files
5. Only report issues you can confirm by investigating the actual code

## What to look for

<!-- TODO: Add your review criteria here -->
- Add specific patterns and issues to check for
- Be precise about what constitutes a real issue vs noise

## What NOT to flag

- Issues unrelated to this agent's focus area
- Theoretical issues requiring unrealistic conditions
- Code style preferences (unless this is a style agent)

## Output

Return a JSON array of issues:

\`\`\`json
[
  {
    "file": "src/example.ts",
    "line": 42,
    "severity": "warning",
    "title": "Brief issue title",
    "message": "Detailed explanation of the issue and why it matters.",
    "fix": "How to fix it",
    "patch": "-old line\\n+new line"
  }
]
\`\`\`

If no issues found, return \`[]\`
`

          await fs.mkdir(agentsDir, { recursive: true })
          try {
            await fs.writeFile(agentPath, agentContent, { flag: "wx" })
          } catch (err: any) {
            if (err.code === "EEXIST") {
              fatal(`Agent '${name}' already exists at agents/${name}.md`)
            }
            throw err
          }
          console.log(`  ${G}created${R} agents/${name}.md`)

          // Update openlens.json if it exists
          const configPath = path.join(cwd, "openlens.json")
          try {
            const raw = await fs.readFile(configPath, "utf-8")
            const config = JSON.parse(raw)
            if (!config.agent) config.agent = {}
            if (!config.agent[name]) {
              config.agent[name] = {
                description,
                prompt: `{file:./agents/${name}.md}`,
                steps,
              }
              await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n")
              console.log(`  ${G}updated${R} openlens.json`)
            }
          } catch {
            console.log(`  ${D}skipped${R} openlens.json (not found — add the agent entry manually)`)
          }

          console.log(
            `\n  ${B}Done.${R} Edit ${B}agents/${name}.md${R} to customize the review criteria.\n`
          )
        }
      )

      .command(
        "test <name>",
        "Test a single agent on current changes",
        (yy) =>
          yy
            .positional("name", {
              type: "string",
              describe: "Agent name to test",
              demandOption: true,
            })
            .option("staged", {
              type: "boolean",
              describe: "Review staged changes",
            })
            .option("unstaged", {
              type: "boolean",
              describe: "Review unstaged changes",
            })
            .option("branch", {
              type: "string",
              describe: "Review diff against branch",
            })
            .option("format", {
              choices: ["text", "json"] as const,
              default: "text" as const,
              describe: "Output format",
            })
            .option("model", {
              alias: "m",
              type: "string",
              describe: "Override model (e.g. opencode/mimo-v2-pro-free)",
            })
            .option("verbose", {
              type: "boolean",
              default: true,
              describe: "Show timing and metadata",
            }),
        async (argv) => {
          const cwd = process.cwd()
          const name = argv.name as string

          let config
          try {
            config = await loadConfig(cwd)
          } catch (err: any) {
            fatal(`Config error: ${err.message}`)
          }

          // Apply model override before loading agents
          if (argv.model) {
            config.model = argv.model
            for (const agent of Object.values(config.agent)) {
              agent.model = argv.model
            }
          }

          const agents = await loadAgents(config, cwd)
          const agent = agents.find((a) => a.name === name)

          if (!agent) {
            const available = agents.map((a) => a.name).join(", ")
            fatal(`Agent '${name}' not found. Available: ${available}`)
          }

          let mode: string
          if (argv.unstaged) {
            mode = "unstaged"
          } else if (argv.branch) {
            config.review.baseBranch = argv.branch
            mode = "branch"
          } else if (argv.staged) {
            mode = "staged"
          } else {
            mode = config.review.defaultMode
          }

          // Filter to just this agent
          config = filterAgents(config, name)

          if (argv.verbose) {
            console.log(`\n  ${B}OpenLens${R}  Testing agent ${B}${name}${R}`)
            console.log(`  model: ${D}${agent.model}${R}`)
            console.log(`  mode: ${D}${mode}${R}`)
            console.log(`  steps: ${D}${agent.steps}${R}`)
            const tools = Object.entries(agent.permission)
              .filter(([_, v]) => v === "allow")
              .map(([k]) => k)
              .join(", ")
            console.log(`  tools: ${D}${tools}${R}`)
            console.log("")
          }

          bus.subscribe("agent.started", () => {
            process.stdout.write(`  ${D}●${R} ${name}  reviewing...\n`)
          })
          bus.subscribe("agent.completed", (evt) => {
            console.log(
              `  ${G}✓${R} ${name}  ${evt.issueCount} issues (${(evt.time / 1000).toFixed(1)}s)`
            )
          })
          bus.subscribe("agent.failed", (evt) => {
            console.log(`  ${RD}✗${R} ${name}  ${evt.error}`)
          })

          try {
            const result = await runReview(config, mode, cwd)

            if (argv.format === "json") {
              console.log(formatJson(result))
            } else {
              console.log(formatText(result))
            }
          } catch (err: any) {
            fatal(err.message)
          }
        }
      )

      .command(
        "validate",
        "Validate all agent configurations",
        (yy) => yy,
        async () => {
          const cwd = process.cwd()
          let hasErrors = false

          let config
          try {
            config = await loadConfig(cwd)
            console.log(`  ${G}✓${R} openlens.json is valid`)
          } catch (err: any) {
            console.log(`  ${RD}✗${R} openlens.json: ${err.message}`)
            process.exit(1)
          }

          const agents = await loadAgents(config, cwd)

          if (agents.length === 0) {
            console.log(`  ${YELLOW}!${R} No agents configured`)
            process.exit(0)
          }

          for (const agent of agents) {
            const issues: string[] = []

            // Check prompt file exists
            const agentConfig = config.agent[agent.name]
            if (agentConfig?.prompt) {
              const fileMatch = agentConfig.prompt.match(/^\{file:(.+)\}$/)
              if (fileMatch) {
                const promptPath = path.resolve(cwd, fileMatch[1])
                try {
                  const content = await fs.readFile(promptPath, "utf-8")
                  // Validate frontmatter parses
                  try {
                    const parsed = matter(content)
                    if (!parsed.content.trim()) {
                      issues.push("prompt file has no content (only frontmatter)")
                    }
                  } catch {
                    issues.push("invalid YAML frontmatter")
                  }
                } catch {
                  issues.push(`prompt file not found: ${fileMatch[1]}`)
                }
              }
            } else if (!agent.prompt.trim()) {
              issues.push("no prompt configured")
            }

            // Check model format
            if (!agent.model.includes("/")) {
              issues.push(`model '${agent.model}' missing provider prefix (e.g. 'anthropic/${agent.model}')`)
            }

            // Check steps
            if (agent.steps < 1) {
              issues.push("steps must be at least 1")
            }

            // Check permissions make sense
            const allowedTools = Object.entries(agent.permission)
              .filter(([_, v]) => v === "allow")
              .map(([k]) => k)
            if (allowedTools.length === 0) {
              issues.push("no tools allowed — agent won't be able to investigate code")
            }

            if (issues.length > 0) {
              hasErrors = true
              console.log(`  ${RD}✗${R} ${B}${agent.name}${R}`)
              for (const issue of issues) {
                console.log(`    ${D}-${R} ${issue}`)
              }
            } else {
              console.log(`  ${G}✓${R} ${B}${agent.name}${R}  ${D}(${agent.model}, ${agent.steps} steps, ${allowedTools.length} tools)${R}`)
            }
          }

          // Check for MCP servers
          const mcpNames = Object.keys(config.mcp)
          if (mcpNames.length > 0) {
            console.log("")
            for (const [name, mcp] of Object.entries(config.mcp)) {
              if (!mcp.enabled) {
                console.log(`  ${D}○${R} ${B}mcp:${name}${R}  ${D}disabled${R}`)
                continue
              }
              if (mcp.type === "local" && !mcp.command) {
                console.log(`  ${RD}✗${R} ${B}mcp:${name}${R}  missing command`)
                hasErrors = true
              } else if (mcp.type === "remote" && !mcp.url) {
                console.log(`  ${RD}✗${R} ${B}mcp:${name}${R}  missing url`)
                hasErrors = true
              } else {
                console.log(`  ${G}✓${R} ${B}mcp:${name}${R}  ${D}(${mcp.type})${R}`)
              }
            }
          }

          console.log("")
          process.exit(hasErrors ? 1 : 0)
        }
      )

      .command(
        "enable <name>",
        "Enable a disabled agent",
        (yy) =>
          yy.positional("name", {
            type: "string",
            describe: "Agent name to enable",
            demandOption: true,
          }),
        async (argv) => {
          const cwd = process.cwd()
          const name = argv.name as string
          const configPath = path.join(cwd, "openlens.json")

          let raw: string
          let config: any
          try {
            raw = await fs.readFile(configPath, "utf-8")
            config = JSON.parse(raw)
          } catch {
            fatal("openlens.json not found. Run: openlens init")
          }

          // Remove from disabled_agents list
          if (Array.isArray(config.disabled_agents)) {
            config.disabled_agents = config.disabled_agents.filter(
              (n: string) => n !== name
            )
          }

          // Remove disable: true from agent config
          if (config.agent?.[name]) {
            delete config.agent[name].disable
          } else {
            fatal(`Agent '${name}' not found in config`)
          }

          await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n")
          console.log(`  ${G}✓${R} ${B}${name}${R} enabled`)
        }
      )

      .command(
        "disable <name>",
        "Disable an agent",
        (yy) =>
          yy.positional("name", {
            type: "string",
            describe: "Agent name to disable",
            demandOption: true,
          }),
        async (argv) => {
          const cwd = process.cwd()
          const name = argv.name as string
          const configPath = path.join(cwd, "openlens.json")

          let raw: string
          let config: any
          try {
            raw = await fs.readFile(configPath, "utf-8")
            config = JSON.parse(raw)
          } catch {
            fatal("openlens.json not found. Run: openlens init")
          }

          if (!config.agent?.[name]) {
            fatal(`Agent '${name}' not found in config`)
          }

          config.agent[name].disable = true

          await fs.writeFile(configPath, JSON.stringify(config, null, 2) + "\n")
          console.log(`  ${D}○${R} ${B}${name}${R} disabled`)
        }
      )

      .demandCommand(1, "Use: openlens agent <list|create|test|validate|enable|disable>")
  )

  .command(
    "init",
    "Initialize OpenLens in current project",
    (y) => y,
    async () => {
      const cwd = process.cwd()

      const agentsDir = path.join(cwd, "agents")
      await fs.mkdir(agentsDir, { recursive: true })

      const srcAgentsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "../agents")
      const defaultAgents = [
        "security",
        "bugs",
        "performance",
        "style",
      ]

      for (const name of defaultAgents) {
        const src = path.join(srcAgentsDir, `${name}.md`)
        const dst = path.join(agentsDir, `${name}.md`)
        try {
          await fs.access(dst)
          console.log(`  ${D}exists${R} agents/${name}.md`)
        } catch {
          try {
            const content = await fs.readFile(src, "utf-8")
            await fs.writeFile(dst, content)
            console.log(`  ${G}created${R} agents/${name}.md`)
          } catch {
            console.log(
              `  ${D}skipped${R} agents/${name}.md (no template)`
            )
          }
        }
      }

      const configPath = path.join(cwd, "openlens.json")
      try {
        await fs.access(configPath)
        console.log(`  ${D}exists${R} openlens.json`)
      } catch {
        const defaultConfig = {
          $schema: "https://openlens.dev/config.json",
          model: "opencode/mimo-v2-pro-free",
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
            defaultMode: "staged",
            instructions: ["REVIEW.md"],
            fullFileContext: true,
            verify: true,
          },
        }
        await fs.writeFile(
          configPath,
          JSON.stringify(defaultConfig, null, 2) + "\n"
        )
        console.log(`  ${G}created${R} openlens.json`)
      }

      console.log(
        `\n  ${B}Done.${R} Run ${B}openlens run${R} to start reviewing.\n`
      )
    }
  )


  .command(
    "serve",
    "Start HTTP server",
    (y) =>
      y
        .option("port", {
          type: "number",
          describe: "Port to listen on (default: from config, or 4096)",
        })
        .option("hostname", {
          type: "string",
          describe: "Hostname to bind to (default: from config, or localhost)",
        }),
    async (argv) => {
      const { createServer } = await import("./server/server.js")
      let config
      try {
        config = await loadConfig(process.cwd())
      } catch (err: any) {
        fatal(`Config error: ${err.message}`)
      }
      const server = createServer(config)

      // CLI flags override config, config provides defaults
      const port = argv.port ?? config.server.port
      const hostname = argv.hostname ?? config.server.hostname

      console.log(
        `\n  ${B}OpenLens Server${R} listening on http://${hostname}:${port}\n`
      )

      // Use Hono's built-in Node.js adapter when available, fall back to Bun.serve
      try {
        const { serve } = await import("@hono/node-server")
        serve({ fetch: server.fetch, port, hostname })
      } catch {
        // @hono/node-server not installed — try Bun.serve (works when running under bun)
        if (typeof globalThis.Bun !== "undefined") {
          Bun.serve({ fetch: server.fetch, port, hostname })
        } else {
          fatal(
            "Install @hono/node-server for Node.js support: npm install @hono/node-server"
          )
        }
      }
    }
  )

  .command(
    "models",
    "List available models from OpenCode",
    (y) => y,
    async () => {
      const { resolveOpencodeBin } = await import("./env.js")
      const bin = resolveOpencodeBin(process.cwd())

      const proc = spawnSync(bin, ["models"], {
        encoding: "utf-8",
        timeout: 15_000,
      })

      if (proc.status !== 0) {
        if (proc.error && (proc.error as NodeJS.ErrnoException).code === "ENOENT") {
          fatal(
            "opencode binary not found. Install with: npm install opencode-ai"
          )
        }
        fatal(`Failed to list models: ${proc.stderr || "unknown error"}`)
      }

      // Show current config model
      try {
        const config = await loadConfig(process.cwd())
        console.log(`\n  ${B}Current model:${R} ${config.model}\n`)
      } catch {
        // No config — skip
      }

      console.log(proc.stdout)
    }
  )

  .command(
    "doctor",
    "Check environment and configuration",
    (y) => y,
    async () => {
      const cwd = process.cwd()
      let hasErrors = false

      console.log(`\n  ${B}OpenLens Doctor${R}\n`)

      // 1. Check git
      const gitCheck = spawnSync("git", ["--version"], { encoding: "utf-8" })
      if (gitCheck.status === 0) {
        console.log(`  ${G}✓${R} git  ${D}${gitCheck.stdout.trim()}${R}`)
      } else {
        console.log(`  ${RD}✗${R} git not found`)
        hasErrors = true
      }

      // 2. Check OpenCode binary
      const { resolveOpencodeBin } = await import("./env.js")
      const bin = resolveOpencodeBin(cwd)
      const ocCheck = spawnSync(bin, ["--version"], { encoding: "utf-8" })
      if (ocCheck.status === 0) {
        console.log(`  ${G}✓${R} opencode  ${D}v${ocCheck.stdout.trim()} (${bin})${R}`)
      } else {
        console.log(`  ${RD}✗${R} opencode binary not found at ${D}${bin}${R}`)
        console.log(`    ${D}Install with: npm install opencode-ai${R}`)
        hasErrors = true
      }

      // 3. Check API keys (optional — free models work without them)
      const hasAnthropic = !!process.env.ANTHROPIC_API_KEY
      const hasOpenAI = !!process.env.OPENAI_API_KEY
      if (hasAnthropic) {
        console.log(`  ${G}✓${R} ANTHROPIC_API_KEY  ${D}set${R}`)
      }
      if (hasOpenAI) {
        console.log(`  ${G}✓${R} OPENAI_API_KEY  ${D}set${R}`)
      }
      if (!hasAnthropic && !hasOpenAI) {
        console.log(`  ${D}○${R} API keys  ${D}not set (optional — free models available)${R}`)
      }

      // 4. Check config
      console.log("")
      try {
        const config = await loadConfig(cwd)
        console.log(`  ${G}✓${R} config  ${D}${config.model}${R}`)

        // 5. Check agents
        const agents = await loadAgents(config, cwd)
        if (agents.length > 0) {
          console.log(`  ${G}✓${R} agents  ${D}${agents.length} loaded (${agents.map((a) => a.name).join(", ")})${R}`)

          // Validate each agent
          for (const agent of agents) {
            const issues: string[] = []
            if (!agent.model.includes("/")) {
              issues.push(`model missing provider prefix`)
            }
            if (!agent.prompt.trim()) {
              issues.push("empty prompt")
            }
            const tools = Object.entries(agent.permission)
              .filter(([_, v]) => v === "allow")
              .map(([k]) => k)
            if (tools.length === 0) {
              issues.push("no tools allowed")
            }
            if (issues.length > 0) {
              console.log(`  ${YELLOW}!${R} ${agent.name}  ${D}${issues.join(", ")}${R}`)
            }
          }
        } else {
          console.log(`  ${YELLOW}!${R} agents  ${D}none configured${R}`)
          console.log(`    ${D}Run: openlens init${R}`)
        }

        // 6. Check MCP servers
        const mcpCount = Object.entries(config.mcp).filter(([_, v]) => v.enabled).length
        if (mcpCount > 0) {
          console.log(`  ${G}✓${R} mcp  ${D}${mcpCount} server(s)${R}`)
        }
      } catch (err: any) {
        console.log(`  ${RD}✗${R} config  ${D}${err.message}${R}`)
        hasErrors = true
      }

      // 7. CI detection
      const { detectCI } = await import("./env.js")
      const ci = detectCI()
      if (ci.isCI) {
        console.log(`  ${G}✓${R} CI  ${D}${ci.provider}${R}`)
      }

      console.log("")
      if (hasErrors) {
        console.log(`  ${YELLOW}Some issues found. Fix them before running reviews.${R}\n`)
        process.exit(1)
      } else {
        console.log(`  ${G}All checks passed.${R}\n`)
      }
    }
  )

  .demandCommand(1, "Please specify a command")
  .strict()
  .help()
  .version("0.1.0")
  .parse()
