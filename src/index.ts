#!/usr/bin/env bun
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { loadConfig } from "./config/config.js"
import { loadAgents } from "./agent/agent.js"
import { runReview } from "./session/review.js"
import { formatText, formatJson } from "./output/format.js"
import { bus } from "./bus/index.js"
import { getDiffStats } from "./tool/diff.js"
import { getDiff, getAutoDetectedDiff } from "./tool/diff.js"
import fs from "fs/promises"
import path from "path"

const BOLD = "\x1b[1m"
const RESET = "\x1b[0m"
const DIM = "\x1b[2m"
const GREEN = "\x1b[32m"

yargs(hideBin(process.argv))
  .scriptName("openreview")
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
          describe: "Comma-separated agent list",
        })
        .option("format", {
          choices: ["text", "json"] as const,
          default: "text" as const,
          describe: "Output format",
        })
        .option("config", {
          type: "string",
          describe: "Config file path",
        }),
    async (argv) => {
      const cwd = process.cwd()
      const config = await loadConfig(cwd)

      // Filter agents if specified
      if (argv.agents) {
        const requested = new Set(
          argv.agents.split(",").map((s) => s.trim())
        )
        for (const name of Object.keys(config.agent)) {
          if (!requested.has(name)) {
            config.agent[name] = { ...config.agent[name], enabled: false }
          }
        }
      }

      // Determine mode
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

      // Subscribe to events for progress output
      if (argv.format === "text") {
        bus.subscribe("review.started", (evt) => {
          console.log(
            `\n  ${BOLD}OpenReview${RESET}  Reviewing ${mode} changes...\n`
          )
        })
        bus.subscribe("agent.started", (evt) => {
          process.stdout.write(
            `  ${DIM}●${RESET} ${evt.name}  reviewing...\r`
          )
        })
        bus.subscribe("agent.completed", (evt) => {
          console.log(
            `  ${GREEN}✓${RESET} ${evt.name}  ${evt.issueCount} issues (${(evt.time / 1000).toFixed(1)}s)`
          )
        })
        bus.subscribe("agent.failed", (evt) => {
          console.log(`  \x1b[31m✗\x1b[0m ${evt.name}  ${evt.error}`)
        })
      }

      const result = await runReview(config, mode, cwd)

      if (argv.format === "json") {
        console.log(formatJson(result))
      } else {
        console.log(formatText(result))
      }

      const hasCritical = result.issues.some(
        (i) => i.severity === "critical"
      )
      process.exit(hasCritical ? 1 : 0)
    }
  )

  .command(
    "agents",
    "List configured review agents",
    (y) => y,
    async () => {
      const config = await loadConfig(process.cwd())
      const agents = await loadAgents(config, process.cwd())

      console.log(`\n  ${BOLD}OpenReview Agents${RESET}\n`)
      for (const agent of agents) {
        console.log(
          `  ${BOLD}${agent.name}${RESET}  ${DIM}${agent.description || ""}${RESET}`
        )
        console.log(`    model: ${agent.model}`)
        console.log("")
      }

      if (agents.length === 0) {
        console.log(`  No agents configured.\n`)
      }
    }
  )

  .command(
    "init",
    "Initialize OpenReview in current project",
    (y) => y,
    async () => {
      const cwd = process.cwd()

      // Create agents directory
      const agentsDir = path.join(cwd, "agents")
      await fs.mkdir(agentsDir, { recursive: true })

      // Copy default agent prompts
      const srcAgentsDir = path.join(import.meta.dir, "../agents")
      const defaultAgents = ["security", "bugs", "performance", "style"]

      for (const name of defaultAgents) {
        const src = path.join(srcAgentsDir, `${name}.md`)
        const dst = path.join(agentsDir, `${name}.md`)
        try {
          await fs.access(dst)
          console.log(`  ${DIM}exists${RESET} agents/${name}.md`)
        } catch {
          try {
            const content = await fs.readFile(src, "utf-8")
            await fs.writeFile(dst, content)
            console.log(`  ${GREEN}created${RESET} agents/${name}.md`)
          } catch {
            console.log(`  ${DIM}skipped${RESET} agents/${name}.md (no template)`)
          }
        }
      }

      // Create openreview.json
      const configPath = path.join(cwd, "openreview.json")
      try {
        await fs.access(configPath)
        console.log(`  ${DIM}exists${RESET} openreview.json`)
      } catch {
        const defaultConfig = {
          $schema: "https://openreview.dev/config.json",
          model: "anthropic/claude-sonnet-4-20250514",
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
          },
        }
        await fs.writeFile(
          configPath,
          JSON.stringify(defaultConfig, null, 2) + "\n"
        )
        console.log(`  ${GREEN}created${RESET} openreview.json`)
      }

      console.log(`\n  ${BOLD}Done.${RESET} Run ${BOLD}openreview run${RESET} to start reviewing.\n`)
    }
  )

  .command(
    "serve",
    "Start HTTP server",
    (y) =>
      y
        .option("port", {
          type: "number",
          default: 3000,
          describe: "Port to listen on",
        })
        .option("hostname", {
          type: "string",
          default: "localhost",
          describe: "Hostname to bind to",
        }),
    async (argv) => {
      const { createServer } = await import("./server/server.js")
      const config = await loadConfig(process.cwd())
      const server = createServer(config)

      const port = argv.port
      const hostname = argv.hostname

      console.log(
        `\n  ${BOLD}OpenReview Server${RESET} listening on http://${hostname}:${port}\n`
      )

      Bun.serve({
        fetch: server.fetch,
        port,
        hostname,
      })
    }
  )

  .demandCommand(1, "Please specify a command")
  .help()
  .version("0.1.0")
  .parse()
