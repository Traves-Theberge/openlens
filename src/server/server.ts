import { Hono } from "hono"
import { readFileSync } from "fs"
import { fileURLToPath } from "url"
import path from "path"
import type { Config } from "../config/schema.js"
import { runReview } from "../session/review.js"
import { loadAgents, filterAgents } from "../agent/agent.js"
import { getDiffStats, getDiff } from "../tool/diff.js"

// Read version from package.json (single source of truth)
const PKG_VERSION = JSON.parse(
  readFileSync(path.join(path.dirname(fileURLToPath(import.meta.url)), "../../package.json"), "utf-8")
).version as string

const VALID_MODES = new Set(["staged", "unstaged", "branch", "auto"])

export function createServer(config: Config) {
  const app = new Hono()

  app.get("/", (c) => {
    return c.json({ name: "openlens", version: PKG_VERSION })
  })

  app.post("/review", async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const cwd = process.cwd()

    // Validate body fields
    const agents = Array.isArray(body.agents) ? body.agents.join(",") : undefined
    const mode = typeof body.mode === "string" && VALID_MODES.has(body.mode)
      ? body.mode
      : config.review.defaultMode
    const branch = typeof body.branch === "string" ? body.branch : undefined

    let reviewConfig = filterAgents(config, agents)

    if (branch) reviewConfig.review.baseBranch = branch
    if (body.verify === false) reviewConfig.review.verify = false
    if (body.fullFileContext === false) reviewConfig.review.fullFileContext = false

    const result = await runReview(reviewConfig, mode, cwd)
    return c.json(result)
  })

  app.get("/agents", async (c) => {
    const agents = await loadAgents(config, process.cwd())
    return c.json(
      agents.map((a) => ({
        name: a.name,
        description: a.description,
        model: a.model,
        mode: a.mode,
        steps: a.steps,
        fullFileContext: a.fullFileContext,
        permission: a.permission,
      }))
    )
  })

  app.get("/config", (c) => {
    // Strip sensitive data — shallow clone top-level, redact env-derived secrets
    const safe = {
      ...config,
      // Never expose the raw mcp block (may contain tokens in environment)
      mcp: Object.fromEntries(
        Object.entries(config.mcp).map(([name, mcp]) => [
          name,
          { type: mcp.type, enabled: mcp.enabled },
        ])
      ),
    }
    return c.json(safe)
  })

  app.get("/diff", async (c) => {
    const raw = c.req.query("mode") || "staged"
    const mode = (["staged", "unstaged", "branch"] as const).includes(raw as any)
      ? (raw as "staged" | "unstaged" | "branch")
      : "staged"
    const diff = await getDiff(mode, config.review.baseBranch)
    const stats = getDiffStats(diff)
    return c.json({ mode, stats })
  })

  app.get("/health", (c) => {
    return c.json({ status: "ok" })
  })

  return app
}
