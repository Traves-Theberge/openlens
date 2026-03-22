import { describe, test, expect } from "bun:test"
import { filterAgents, excludeAgents } from "../../src/agent/agent.js"
import { ConfigSchema } from "../../src/config/schema.js"

function baseConfig() {
  return ConfigSchema.parse({
    agent: {
      security: { description: "Security scanner" },
      bugs: { description: "Bug detector" },
      style: { description: "Style checker" },
    },
  })
}

describe("filterAgents", () => {
  test("returns config unchanged when no filter", () => {
    const config = baseConfig()
    const filtered = filterAgents(config, undefined)
    expect(filtered).toBe(config)
  })

  test("disables agents not in the filter list", () => {
    const config = baseConfig()
    const filtered = filterAgents(config, "security,bugs")
    expect(filtered.agent.security.disable).toBe(false)
    expect(filtered.agent.bugs.disable).toBe(false)
    expect(filtered.agent.style.disable).toBe(true)
  })

  test("handles single agent filter", () => {
    const config = baseConfig()
    const filtered = filterAgents(config, "security")
    expect(filtered.agent.security.disable).toBe(false)
    expect(filtered.agent.bugs.disable).toBe(true)
    expect(filtered.agent.style.disable).toBe(true)
  })

  test("trims whitespace in filter names", () => {
    const config = baseConfig()
    const filtered = filterAgents(config, " security , bugs ")
    expect(filtered.agent.security.disable).toBe(false)
    expect(filtered.agent.bugs.disable).toBe(false)
    expect(filtered.agent.style.disable).toBe(true)
  })

  test("does not modify original config", () => {
    const config = baseConfig()
    filterAgents(config, "security")
    expect(config.agent.bugs.disable).toBe(false)
    expect(config.agent.style.disable).toBe(false)
  })
})

describe("excludeAgents", () => {
  test("disables specified agents", () => {
    const config = baseConfig()
    const result = excludeAgents(config, "style")
    expect(result.agent.security.disable).toBe(false)
    expect(result.agent.bugs.disable).toBe(false)
    expect(result.agent.style.disable).toBe(true)
  })

  test("disables multiple agents", () => {
    const config = baseConfig()
    const result = excludeAgents(config, "security,style")
    expect(result.agent.security.disable).toBe(true)
    expect(result.agent.bugs.disable).toBe(false)
    expect(result.agent.style.disable).toBe(true)
  })

  test("trims whitespace", () => {
    const config = baseConfig()
    const result = excludeAgents(config, " security , style ")
    expect(result.agent.security.disable).toBe(true)
    expect(result.agent.style.disable).toBe(true)
  })

  test("ignores unknown agent names", () => {
    const config = baseConfig()
    const result = excludeAgents(config, "nonexistent")
    expect(result.agent.security.disable).toBe(false)
    expect(result.agent.bugs.disable).toBe(false)
    expect(result.agent.style.disable).toBe(false)
  })

  test("does not modify original config", () => {
    const config = baseConfig()
    excludeAgents(config, "security")
    expect(config.agent.security.disable).toBe(false)
  })
})
