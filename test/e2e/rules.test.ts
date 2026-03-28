import { describe, test, expect, afterEach } from "bun:test"
import fs from "fs"
import path from "path"
import {
  run,
  createTempGitRepo,
  cleanup,
  writeConfig,
  addStagedFile,
} from "./helpers"

let tmpDir: string

afterEach(() => {
  if (tmpDir) cleanup(tmpDir)
})

function setupRepoWithAgents(dir: string) {
  writeConfig(dir, {
    model: "opencode/big-pickle",
    agent: {
      security: {
        description: "Security scanner",
        prompt: "You are a security reviewer. Return `[]`.",
      },
    },
    disabled_agents: ["bugs", "performance", "style"],
  })
}

describe("rules discovery: CLAUDE.md", () => {
  test("dry-run works when CLAUDE.md exists in project root", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithAgents(tmpDir)
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      "# Project Rules\n\nAlways check for SQL injection.\n"
    )
    addStagedFile(tmpDir, "src/app.ts", "const x = 1\n")

    const result = run(["run", "--dry-run"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("dry run")
    expect(result.stdout).toContain("security")
  })

  test("dry-run works when CLAUDE.md exists in subdirectory", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithAgents(tmpDir)
    const subDir = path.join(tmpDir, "packages", "core")
    fs.mkdirSync(subDir, { recursive: true })
    fs.writeFileSync(
      path.join(subDir, "CLAUDE.md"),
      "# Core Rules\n\nStrict type checking.\n"
    )
    addStagedFile(tmpDir, "src/app.ts", "const x = 1\n")

    const result = run(["run", "--dry-run"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("dry run")
  })
})

describe("rules discovery: AGENTS.md", () => {
  test("dry-run works when AGENTS.md exists in project root", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithAgents(tmpDir)
    fs.writeFileSync(
      path.join(tmpDir, "AGENTS.md"),
      "# Agent Instructions\n\nFocus on performance.\n"
    )
    addStagedFile(tmpDir, "src/app.ts", "const x = 1\n")

    const result = run(["run", "--dry-run"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("dry run")
  })
})

describe("rules discovery: .openlens/rules.md", () => {
  test("dry-run works when .openlens/rules.md exists", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithAgents(tmpDir)
    const rulesDir = path.join(tmpDir, ".openlens")
    fs.mkdirSync(rulesDir, { recursive: true })
    fs.writeFileSync(
      path.join(rulesDir, "rules.md"),
      "# Custom Rules\n\nAll SQL queries must use parameterized statements.\n"
    )
    addStagedFile(tmpDir, "src/db.ts", "const query = 'SELECT 1'\n")

    const result = run(["run", "--dry-run"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("dry run")
  })
})

describe("rules discovery: multiple rules files", () => {
  test("dry-run succeeds with all three well-known files present", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithAgents(tmpDir)

    // Create all three well-known rules files
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "# Claude Rules\nRule A.\n")
    fs.writeFileSync(path.join(tmpDir, "AGENTS.md"), "# Agent Rules\nRule B.\n")
    const rulesDir = path.join(tmpDir, ".openlens")
    fs.mkdirSync(rulesDir, { recursive: true })
    fs.writeFileSync(path.join(rulesDir, "rules.md"), "# Openlens Rules\nRule C.\n")

    addStagedFile(tmpDir, "src/app.ts", "const x = 1\n")

    const result = run(["run", "--dry-run"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("dry run")
  })

  test("doctor works with rules files present", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithAgents(tmpDir)
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "# Project\nSome rules.\n")

    const result = run(["doctor"], tmpDir)

    expect(result.exitCode).not.toBeUndefined()
    expect(result.stdout).toContain("Doctor")
  })
})

describe("rules discovery: no rules files", () => {
  test("dry-run works without any rules files", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithAgents(tmpDir)
    addStagedFile(tmpDir, "src/app.ts", "const x = 1\n")

    const result = run(["run", "--dry-run"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("dry run")
  })
})
