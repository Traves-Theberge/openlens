import { Hono } from "hono"
import type { Config } from "../config/schema.js"
import { runReview } from "../session/review.js"
import { loadAgents, filterAgents } from "../agent/agent.js"
import { getDiffStats, getDiff } from "../tool/diff.js"

export function createServer(config: Config) {
  const app = new Hono()

  app.get("/", (c) => {
    return c.json({ name: "openreview", version: "0.1.0" })
  })

  app.post("/review", async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const cwd = process.cwd()

    let reviewConfig = filterAgents(config, body.agents?.join(","))

    if (body.branch) reviewConfig.review.baseBranch = body.branch
    if (body.verify === false) reviewConfig.review.verify = false
    if (body.fullFileContext === false) reviewConfig.review.fullFileContext = false

    const result = await runReview(
      reviewConfig,
      body.mode || config.review.defaultMode,
      cwd
    )
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
        permission: a.permission,
        steps: a.steps,
      }))
    )
  })

  app.get("/config", (c) => {
    // Strip sensitive data
    const safe = { ...config }
    return c.json(safe)
  })

  app.get("/diff", async (c) => {
    const mode = (c.req.query("mode") || "staged") as
      | "staged"
      | "unstaged"
      | "branch"
    const diff = await getDiff(mode, config.review.baseBranch)
    const stats = getDiffStats(diff)
    return c.json({ mode, stats })
  })

  app.get("/health", (c) => {
    return c.json({ status: "ok" })
  })

  return app
}
