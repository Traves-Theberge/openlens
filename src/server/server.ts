import { Hono } from "hono"
import type { Config } from "../config/schema.js"
import { runReview } from "../session/review.js"
import { loadAgents } from "../agent/agent.js"
import { loadConfig } from "../config/config.js"
import { getDiffStats, getDiff } from "../tool/diff.js"

export function createServer(config: Config) {
  const app = new Hono()

  app.get("/", (c) => {
    return c.json({
      name: "openreview",
      version: "0.1.0",
    })
  })

  app.post("/review", async (c) => {
    const body = await c.req.json().catch(() => ({}))
    const mode = body.mode || config.review.defaultMode
    const cwd = process.cwd()

    // Override agents if specified
    const reviewConfig = { ...config }
    if (body.agents && Array.isArray(body.agents)) {
      const requested = new Set(body.agents)
      reviewConfig.agent = { ...config.agent }
      for (const name of Object.keys(reviewConfig.agent)) {
        if (!requested.has(name)) {
          reviewConfig.agent[name] = {
            ...reviewConfig.agent[name],
            enabled: false,
          }
        }
      }
    }

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
      }))
    )
  })

  app.get("/config", (c) => {
    return c.json(config)
  })

  app.get("/diff", async (c) => {
    const mode = (c.req.query("mode") || "staged") as
      | "staged"
      | "unstaged"
      | "branch"
    const diff = await getDiff(mode, config.review.baseBranch)
    const stats = getDiffStats(diff)
    return c.json({ mode, stats, diff })
  })

  app.get("/health", (c) => {
    return c.json({ status: "ok" })
  })

  return app
}
