import { describe, test, expect } from "bun:test"
import { createServer } from "../../src/server/server.js"
import { ConfigSchema } from "../../src/config/schema.js"

function baseConfig() {
  return ConfigSchema.parse({
    agent: {
      security: { description: "Security scanner" },
      bugs: { description: "Bug detector" },
    },
  })
}

describe("createServer", () => {
  test("GET / returns name and version", async () => {
    const app = createServer(baseConfig())
    const res = await app.request("/")
    const body = await res.json()
    expect(body.name).toBe("openlens")
    expect(body.version).toBe("0.2.0")
  })

  test("GET /health returns ok", async () => {
    const app = createServer(baseConfig())
    const res = await app.request("/health")
    const body = await res.json()
    expect(body.status).toBe("ok")
  })

  test("GET /config does not expose mcp environment/command details", async () => {
    const config = ConfigSchema.parse({
      mcp: {
        myserver: {
          type: "local",
          command: "secret-binary",
          args: ["--token=SECRET"],
          environment: { API_KEY: "sk-secret" },
          enabled: true,
        },
      },
    })
    const app = createServer(config)
    const res = await app.request("/config")
    const body = await res.json()

    // Should only have type and enabled, not command/args/environment
    expect(body.mcp.myserver.type).toBe("local")
    expect(body.mcp.myserver.enabled).toBe(true)
    expect(body.mcp.myserver.command).toBeUndefined()
    expect(body.mcp.myserver.args).toBeUndefined()
    expect(body.mcp.myserver.environment).toBeUndefined()
  })

  test("GET /config returns model and review settings", async () => {
    const app = createServer(baseConfig())
    const res = await app.request("/config")
    const body = await res.json()
    expect(body.model).toBe("opencode/big-pickle")
    expect(body.review.defaultMode).toBe("staged")
  })

  test("GET /agents returns agent list", async () => {
    const app = createServer(baseConfig())
    const res = await app.request("/agents")
    const body = await res.json()
    expect(Array.isArray(body)).toBe(true)
  })

  test("GET /diff with invalid mode defaults to staged", async () => {
    // Invalid mode should be treated as "staged" without crashing
    const app = createServer(baseConfig())
    const res = await app.request("/diff?mode=invalid")
    const body = await res.json()
    // Mode should default to "staged" since "invalid" is not recognized
    expect(body.mode).toBe("staged")
  })
})
