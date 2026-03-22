import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { loadConfig, loadInstructions } from "../../src/config/config.js"
import fs from "fs/promises"
import path from "path"
import os from "os"

describe("loadConfig", () => {
  let tmpDir: string
  const originalEnv = { ...process.env }

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openlens-cfg-"))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
  })

  test("returns valid config with defaults when no config file exists", async () => {
    const config = await loadConfig(tmpDir)
    expect(config.model).toBe("anthropic/claude-sonnet-4-20250514")
    expect(config.server.port).toBe(4096)
    expect(config.review.defaultMode).toBe("staged")
  })

  test("loads project config from openlens.json", async () => {
    await fs.writeFile(
      path.join(tmpDir, "openlens.json"),
      JSON.stringify({ model: "openai/gpt-4o", review: { baseBranch: "develop" } })
    )
    const config = await loadConfig(tmpDir)
    expect(config.model).toBe("openai/gpt-4o")
    expect(config.review.baseBranch).toBe("develop")
  })

  test("loads project config from openlens.jsonc", async () => {
    await fs.writeFile(
      path.join(tmpDir, "openlens.jsonc"),
      '// comment\n{ "model": "openai/gpt-4o" }\n'
    )
    const config = await loadConfig(tmpDir)
    expect(config.model).toBe("openai/gpt-4o")
  })

  test("prefers openlens.json over openlens.jsonc", async () => {
    await fs.writeFile(
      path.join(tmpDir, "openlens.json"),
      JSON.stringify({ model: "from-json" })
    )
    await fs.writeFile(
      path.join(tmpDir, "openlens.jsonc"),
      JSON.stringify({ model: "from-jsonc" })
    )
    const config = await loadConfig(tmpDir)
    expect(config.model).toBe("from-json")
  })

  test("environment variable OPENLENS_MODEL overrides config", async () => {
    await fs.writeFile(
      path.join(tmpDir, "openlens.json"),
      JSON.stringify({ model: "from-file" })
    )
    process.env.OPENLENS_MODEL = "from-env"
    const config = await loadConfig(tmpDir)
    expect(config.model).toBe("from-env")
  })

  test("environment variable OPENLENS_PORT overrides config", async () => {
    process.env.OPENLENS_PORT = "9999"
    const config = await loadConfig(tmpDir)
    expect(config.server.port).toBe(9999)
  })

  test("resolves {env:VAR} substitutions", async () => {
    process.env.MY_BRANCH = "feature"
    await fs.writeFile(
      path.join(tmpDir, "openlens.json"),
      JSON.stringify({ review: { baseBranch: "{env:MY_BRANCH}" } })
    )
    const config = await loadConfig(tmpDir)
    expect(config.review.baseBranch).toBe("feature")
  })

  test("CI environment sets branch mode by default", async () => {
    process.env.CI = "true"
    process.env.GITHUB_ACTIONS = "true"
    process.env.GITHUB_BASE_REF = "main"
    // Ensure no previous mode override
    delete process.env.OPENLENS_MODE
    const config = await loadConfig(tmpDir)
    expect(config.review.defaultMode).toBe("branch")
  })
})

describe("loadInstructions", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openlens-instr-"))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("loads content from instruction files", async () => {
    await fs.writeFile(path.join(tmpDir, "REVIEW.md"), "Review rules here")
    const content = await loadInstructions(["REVIEW.md"], tmpDir)
    expect(content).toContain("Review rules here")
  })

  test("combines multiple instruction files", async () => {
    await fs.writeFile(path.join(tmpDir, "REVIEW.md"), "General rules")
    await fs.writeFile(path.join(tmpDir, "SECURITY.md"), "Security rules")
    const content = await loadInstructions(["REVIEW.md", "SECURITY.md"], tmpDir)
    expect(content).toContain("General rules")
    expect(content).toContain("Security rules")
  })

  test("skips missing files silently", async () => {
    const content = await loadInstructions(["NONEXISTENT.md"], tmpDir)
    expect(content).toBe("")
  })

  test("returns empty string for empty file list", async () => {
    const content = await loadInstructions([], tmpDir)
    expect(content).toBe("")
  })
})
