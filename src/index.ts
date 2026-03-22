#!/usr/bin/env bun
import yargs from "yargs"
import { hideBin } from "yargs/helpers"
import { loadConfig } from "./config/config.js"
import { loadAgents, filterAgents } from "./agent/agent.js"
import { runReview } from "./session/review.js"
import { formatText, formatJson, formatSarif } from "./output/format.js"
import { bus } from "./bus/index.js"
import fs from "fs/promises"
import path from "path"

const NO_COLOR = !!process.env.NO_COLOR
const B = NO_COLOR ? "" : "\x1b[1m"
const R = NO_COLOR ? "" : "\x1b[0m"
const D = NO_COLOR ? "" : "\x1b[2m"
const G = NO_COLOR ? "" : "\x1b[32m"
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
          describe: "Comma-separated agent list",
        })
        .option("format", {
          choices: ["text", "json", "sarif"] as const,
          default: "text" as const,
          describe: "Output format",
        })
        .option("no-verify", {
          type: "boolean",
          describe: "Skip verification pass",
        })
        .option("no-context", {
          type: "boolean",
          describe: "Skip full file context (diff only)",
        }),
    async (argv) => {
      const cwd = process.cwd()

      // Validate git repo
      const gitCheck = Bun.spawnSync(["git", "rev-parse", "--git-dir"], {
        cwd,
      })
      if (gitCheck.exitCode !== 0) {
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

      if (argv.noVerify) config.review.verify = false
      if (argv.noContext) config.review.fullFileContext = false

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

  .command(
    "agents",
    "List configured review agents",
    (y) => y,
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
    "init",
    "Initialize OpenLens in current project",
    (y) => y,
    async () => {
      const cwd = process.cwd()

      const agentsDir = path.join(cwd, "agents")
      await fs.mkdir(agentsDir, { recursive: true })

      const srcAgentsDir = path.join(import.meta.dir, "../agents")
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
      let config
      try {
        config = await loadConfig(process.cwd())
      } catch (err: any) {
        fatal(`Config error: ${err.message}`)
      }
      const server = createServer(config)

      console.log(
        `\n  ${B}OpenLens Server${R} listening on http://${argv.hostname}:${argv.port}\n`
      )

      Bun.serve({
        fetch: server.fetch,
        port: argv.port,
        hostname: argv.hostname,
      })
    }
  )

  .demandCommand(1, "Please specify a command")
  .help()
  .version("0.1.0")
  .parse()
