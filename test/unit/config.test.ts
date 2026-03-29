import { describe, test, expect } from "bun:test"
import { ConfigSchema, AgentConfigSchema, McpServerSchema } from "../../src/config/schema.js"

describe("ConfigSchema", () => {
  test("parses minimal config with defaults", () => {
    const config = ConfigSchema.parse({})
    expect(config.model).toBe("opencode/big-pickle")
    expect(config.server.port).toBe(4096)
    expect(config.server.hostname).toBe("localhost")
    expect(config.review.defaultMode).toBe("staged")
    expect(config.review.verify).toBe(true)
    expect(config.review.fullFileContext).toBe(true)
    expect(config.review.timeoutMs).toBe(180_000)
    expect(config.review.maxConcurrency).toBe(4)
    expect(config.review.baseBranch).toBe("main")
    expect(config.review.instructions).toEqual(["REVIEW.md"])
    expect(config.disabled_agents).toEqual([])
    expect(config.agent).toEqual({})
  })

  test("parses full config", () => {
    const config = ConfigSchema.parse({
      model: "openai/gpt-4o",
      agent: {
        security: {
          description: "Scanner",
          model: "anthropic/claude-sonnet-4-20250514",
          steps: 3,
          permission: { read: "allow", bash: "deny" },
        },
      },
      permission: { read: "allow" },
      server: { port: 8080, hostname: "0.0.0.0" },
      review: {
        defaultMode: "branch",
        baseBranch: "develop",
        fullFileContext: false,
        verify: false,
        timeoutMs: 60_000,
        maxConcurrency: 2,
        instructions: ["REVIEW.md", "SECURITY.md"],
      },
      suppress: {
        files: ["generated/**"],
        patterns: ["TODO"],
      },
      disabled_agents: ["style"],
    })

    expect(config.model).toBe("openai/gpt-4o")
    expect(config.agent.security.description).toBe("Scanner")
    expect(config.agent.security.steps).toBe(3)
    expect(config.server.port).toBe(8080)
    expect(config.review.defaultMode).toBe("branch")
    expect(config.review.fullFileContext).toBe(false)
    expect(config.suppress.files).toEqual(["generated/**"])
    expect(config.disabled_agents).toEqual(["style"])
  })

  test("rejects invalid review mode", () => {
    expect(() =>
      ConfigSchema.parse({ review: { defaultMode: "invalid" } })
    ).toThrow()
  })
})

describe("AgentConfigSchema", () => {
  test("applies defaults", () => {
    const agent = AgentConfigSchema.parse({})
    expect(agent.mode).toBe("subagent")
    expect(agent.disable).toBe(false)
    expect(agent.hidden).toBe(false)
  })

  test("validates temperature range", () => {
    expect(() => AgentConfigSchema.parse({ temperature: 1.5 })).toThrow()
    expect(() => AgentConfigSchema.parse({ temperature: -0.1 })).toThrow()
    const agent = AgentConfigSchema.parse({ temperature: 0.5 })
    expect(agent.temperature).toBe(0.5)
  })

  test("validates steps min", () => {
    expect(() => AgentConfigSchema.parse({ steps: 0 })).toThrow()
    const agent = AgentConfigSchema.parse({ steps: 1 })
    expect(agent.steps).toBe(1)
  })

  test("parses permission with string values", () => {
    const agent = AgentConfigSchema.parse({
      permission: { read: "allow", bash: "deny", edit: "ask" },
    })
    expect(agent.permission).toEqual({
      read: "allow",
      bash: "deny",
      edit: "ask",
    })
  })

  test("parses permission with granular patterns", () => {
    const agent = AgentConfigSchema.parse({
      permission: {
        bash: { "git *": "allow", "*": "deny" },
      },
    })
    expect(agent.permission?.bash).toEqual({ "git *": "allow", "*": "deny" })
  })

  test("parses fullFileContext", () => {
    const agent = AgentConfigSchema.parse({ fullFileContext: false })
    expect(agent.fullFileContext).toBe(false)
  })

  test("all mode values accepted", () => {
    for (const mode of ["primary", "subagent", "all"] as const) {
      const agent = AgentConfigSchema.parse({ mode })
      expect(agent.mode).toBe(mode)
    }
  })

  test("rejects invalid mode", () => {
    expect(() => AgentConfigSchema.parse({ mode: "invalid" })).toThrow()
  })
})

describe("McpServerSchema", () => {
  test("accepts valid remote MCP with URL", () => {
    const mcp = McpServerSchema.parse({
      type: "remote",
      url: "https://mcp.example.com/api",
    })
    expect(mcp.type).toBe("remote")
    expect(mcp.url).toBe("https://mcp.example.com/api")
  })

  test("rejects remote MCP without URL", () => {
    expect(() =>
      McpServerSchema.parse({ type: "remote" })
    ).toThrow("Remote MCP servers require a valid url")
  })

  test("rejects invalid URL format", () => {
    expect(() =>
      McpServerSchema.parse({ type: "remote", url: "not-a-url" })
    ).toThrow()
  })

  test("accepts valid local MCP with command", () => {
    const mcp = McpServerSchema.parse({
      type: "local",
      command: "node",
      args: ["server.js"],
    })
    expect(mcp.type).toBe("local")
    expect(mcp.command).toBe("node")
  })

  test("accepts local MCP without URL", () => {
    const mcp = McpServerSchema.parse({
      type: "local",
      command: "node",
    })
    expect(mcp.type).toBe("local")
  })
})

describe("ConfigSchema server validation", () => {
  test("rejects invalid port number", () => {
    expect(() =>
      ConfigSchema.parse({ server: { port: 0 } })
    ).toThrow()
    expect(() =>
      ConfigSchema.parse({ server: { port: 70000 } })
    ).toThrow()
  })

  test("rejects empty hostname", () => {
    expect(() =>
      ConfigSchema.parse({ server: { hostname: "" } })
    ).toThrow()
  })

  test("accepts valid port range", () => {
    const config = ConfigSchema.parse({ server: { port: 8080 } })
    expect(config.server.port).toBe(8080)
  })
})
