import { describe, test, expect } from "bun:test"
import { ConfigSchema } from "../../src/config/schema.js"
import { loadAgents, filterAgents } from "../../src/agent/agent.js"

// Integration tests that test the full agent loading pipeline
// These require the agents/ directory to exist with built-in prompts

describe("agent loading (integration)", () => {
  test("loads built-in agents from agents/ directory", async () => {
    const config = ConfigSchema.parse({
      agent: {
        security: {
          description: "Security scanner",
          prompt: "{file:agents/security.md}",
        },
        bugs: {
          description: "Bug detector",
          prompt: "{file:agents/bugs.md}",
        },
      },
    })

    const agents = await loadAgents(config, process.cwd())
    expect(agents).toHaveLength(2)

    const security = agents.find((a) => a.name === "security")
    expect(security).toBeDefined()
    expect(security!.mode).toBe("subagent")
    expect(security!.permission.read).toBe("allow")
    expect(security!.permission.bash).toBe("deny")
    expect(security!.prompt).toContain("security")
  })

  test("skips disabled agents", async () => {
    const config = ConfigSchema.parse({
      agent: {
        security: { description: "Scanner" },
        bugs: { description: "Detector", disable: true },
      },
    })

    const agents = await loadAgents(config, process.cwd())
    expect(agents).toHaveLength(1)
    expect(agents[0].name).toBe("security")
  })

  test("skips agents in disabled_agents list", async () => {
    const config = ConfigSchema.parse({
      agent: {
        security: { description: "Scanner" },
        bugs: { description: "Detector" },
      },
      disabled_agents: ["bugs"],
    })

    const agents = await loadAgents(config, process.cwd())
    expect(agents).toHaveLength(1)
    expect(agents[0].name).toBe("security")
  })

  test("merges permissions: defaults < global < agent", async () => {
    const config = ConfigSchema.parse({
      permission: { webfetch: "allow" },
      agent: {
        security: {
          description: "Scanner",
          permission: { bash: "allow" },
        },
      },
    })

    const agents = await loadAgents(config, process.cwd())
    const agent = agents[0]

    // Default
    expect(agent.permission.read).toBe("allow")
    // Global override
    expect(agent.permission.webfetch).toBe("allow")
    // Agent override
    expect(agent.permission.bash).toBe("allow")
    // Default not overridden
    expect(agent.permission.edit).toBe("deny")
  })

  test("inherits global model when agent has none and no frontmatter model", async () => {
    const config = ConfigSchema.parse({
      model: "openai/gpt-4o",
      agent: {
        // Use inline prompt so no frontmatter model is loaded
        custom: { description: "Custom", prompt: "You are a reviewer." },
      },
    })

    const agents = await loadAgents(config, process.cwd())
    expect(agents[0].model).toBe("openai/gpt-4o")
  })

  test("agent model overrides global model", async () => {
    const config = ConfigSchema.parse({
      model: "openai/gpt-4o",
      agent: {
        security: {
          description: "Scanner",
          model: "anthropic/claude-sonnet-4-20250514",
        },
      },
    })

    const agents = await loadAgents(config, process.cwd())
    expect(agents[0].model).toBe("anthropic/claude-sonnet-4-20250514")
  })

  test("filterAgents + loadAgents pipeline", async () => {
    const config = ConfigSchema.parse({
      agent: {
        security: { description: "Scanner" },
        bugs: { description: "Detector" },
        style: { description: "Checker" },
      },
    })

    const filtered = filterAgents(config, "security,style")
    const agents = await loadAgents(filtered, process.cwd())

    expect(agents).toHaveLength(2)
    expect(agents.map((a) => a.name).sort()).toEqual(["security", "style"])
  })
})
