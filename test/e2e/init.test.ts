import { describe, test, expect, afterEach } from "bun:test"
import fs from "fs"
import path from "path"
import { run, createTempGitRepo, cleanup } from "./helpers"

let tmpDir: string

afterEach(() => {
  if (tmpDir) cleanup(tmpDir)
})

describe("openlens init", () => {
  test("creates openlens.json and agents directory", () => {
    tmpDir = createTempGitRepo()
    const result = run(["init"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("created")

    // openlens.json should exist
    const configPath = path.join(tmpDir, "openlens.json")
    expect(fs.existsSync(configPath)).toBe(true)

    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"))
    expect(config.$schema).toBeDefined()
    expect(config.model).toContain("anthropic/")
    expect(config.agent).toBeDefined()
    expect(config.agent.security).toBeDefined()
    expect(config.agent.bugs).toBeDefined()
    expect(config.agent.performance).toBeDefined()
    expect(config.agent.style).toBeDefined()
  })

  test("creates built-in agent prompt files", () => {
    tmpDir = createTempGitRepo()
    run(["init"], tmpDir)

    const agentsDir = path.join(tmpDir, "agents")
    expect(fs.existsSync(agentsDir)).toBe(true)

    for (const name of ["security", "bugs", "performance", "style"]) {
      const agentPath = path.join(agentsDir, `${name}.md`)
      expect(fs.existsSync(agentPath)).toBe(true)

      const content = fs.readFileSync(agentPath, "utf-8")
      // Each agent file should have YAML frontmatter
      expect(content).toStartWith("---\n")
      expect(content).toContain("mode: subagent")
    }
  })

  test("does not overwrite existing config", () => {
    tmpDir = createTempGitRepo()
    const configPath = path.join(tmpDir, "openlens.json")
    fs.writeFileSync(configPath, '{"model":"custom/model"}\n')

    const result = run(["init"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("exists")

    // Original config should be preserved
    const config = JSON.parse(fs.readFileSync(configPath, "utf-8"))
    expect(config.model).toBe("custom/model")
  })

  test("does not overwrite existing agent files", () => {
    tmpDir = createTempGitRepo()
    const agentsDir = path.join(tmpDir, "agents")
    fs.mkdirSync(agentsDir, { recursive: true })
    fs.writeFileSync(path.join(agentsDir, "security.md"), "custom content\n")

    const result = run(["init"], tmpDir)
    expect(result.exitCode).toBe(0)

    const content = fs.readFileSync(path.join(agentsDir, "security.md"), "utf-8")
    expect(content).toBe("custom content\n")
  })

  test("is idempotent — running twice produces same result", () => {
    tmpDir = createTempGitRepo()
    run(["init"], tmpDir)
    const result = run(["init"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("exists")
  })
})
