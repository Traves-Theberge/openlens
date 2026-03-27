import { describe, test, expect, afterEach } from "bun:test"
import fs from "fs"
import path from "path"
import { run, createTempGitRepo, cleanup } from "./helpers"

let tmpDir: string

afterEach(() => {
  if (tmpDir) cleanup(tmpDir)
})

describe("openlens setup", () => {
  test("setup --help shows all options", () => {
    tmpDir = createTempGitRepo()
    const result = run(["setup", "--help"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("--config")
    expect(result.stdout).toContain("--hooks")
    expect(result.stdout).toContain("--plugins")
    expect(result.stdout).toContain("--ci")
    expect(result.stdout).toContain("--agents")
    expect(result.stdout).toContain("--yes")
  })

  test("setup --config --yes creates openlens.json", () => {
    tmpDir = createTempGitRepo()
    const result = run(["setup", "--config", "--yes"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(fs.existsSync(path.join(tmpDir, "openlens.json"))).toBe(true)

    const config = JSON.parse(fs.readFileSync(path.join(tmpDir, "openlens.json"), "utf-8"))
    expect(config.model).toBe("opencode/big-pickle")
    expect(config.agent).toBeDefined()
    expect(config.review).toBeDefined()
  })

  test("setup --agents --yes creates agent files", () => {
    tmpDir = createTempGitRepo()
    // Need config first
    run(["setup", "--config", "--yes"], tmpDir)
    const result = run(["setup", "--agents", "--yes"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(fs.existsSync(path.join(tmpDir, "agents", "security.md"))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, "agents", "bugs.md"))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, "agents", "performance.md"))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, "agents", "style.md"))).toBe(true)
  })

  test("setup --hooks --yes installs git hooks", () => {
    tmpDir = createTempGitRepo()
    const result = run(["setup", "--hooks", "--yes"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(fs.existsSync(path.join(tmpDir, ".git", "hooks", "pre-commit"))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, ".git", "hooks", "pre-push"))).toBe(true)
  })

  test("setup --ci --yes generates github workflow when github remote exists", () => {
    tmpDir = createTempGitRepo()
    // Add a github remote
    const { spawnSync } = require("child_process")
    spawnSync("git", ["remote", "add", "origin", "https://github.com/test/test.git"], { cwd: tmpDir })

    const result = run(["setup", "--ci", "--yes"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(fs.existsSync(path.join(tmpDir, ".github", "workflows", "openlens-review.yml"))).toBe(true)
  })

  test("setup --yes runs all sections", () => {
    tmpDir = createTempGitRepo()
    const result = run(["setup", "--yes"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(fs.existsSync(path.join(tmpDir, "openlens.json"))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, "agents", "security.md"))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, ".git", "hooks", "pre-commit"))).toBe(true)
  })
})
