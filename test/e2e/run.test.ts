import { describe, test, expect, afterEach } from "bun:test"
import fs from "fs"
import path from "path"
import {
  run,
  createTempGitRepo,
  cleanup,
  writeConfig,
  writeAgent,
  addStagedFile,
  addModifiedFile,
} from "./helpers"

let tmpDir: string

afterEach(() => {
  if (tmpDir) cleanup(tmpDir)
})

function setupRepoWithConfig(dir: string) {
  writeConfig(dir, {
    model: "anthropic/claude-sonnet-4-20250514",
    agent: {
      security: {
        description: "Security scanner",
        prompt: "{file:./agents/security.md}",
      },
      bugs: {
        description: "Bug detector",
        prompt: "{file:./agents/bugs.md}",
      },
    },
    review: {
      defaultMode: "staged",
      verify: false,
    },
  })

  // Write minimal agent files
  const agentContent = `---
description: Test agent
mode: subagent
model: anthropic/claude-sonnet-4-20250514
steps: 3
permission:
  read: allow
  grep: allow
  glob: allow
  list: allow
  edit: deny
  bash: deny
---

You are a test code reviewer. Return \`[]\` if no issues found.
`
  writeAgent(dir, "security", agentContent)
  writeAgent(dir, "bugs", agentContent)
}

describe("openlens run --dry-run", () => {
  test("shows plan without making API calls", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithConfig(tmpDir)
    addStagedFile(tmpDir, "src/auth.ts", 'export function login() { return "ok" }\n')

    const result = run(["run", "--dry-run"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("dry run")
    expect(result.stdout).toContain("mode:")
    expect(result.stdout).toContain("staged")
    expect(result.stdout).toContain("agents:")
    expect(result.stdout).toContain("security")
    expect(result.stdout).toContain("verify:")
    expect(result.stdout).toContain("Remove --dry-run to execute")
  })

  test("shows file count in dry-run", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithConfig(tmpDir)
    addStagedFile(tmpDir, "src/a.ts", "export const a = 1\n")
    addStagedFile(tmpDir, "src/b.ts", "export const b = 2\n")

    const result = run(["run", "--dry-run"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("files:")
    // Should mention both files
    expect(result.stdout).toContain("src/a.ts")
    expect(result.stdout).toContain("src/b.ts")
  })

  test("reports no changes when nothing staged", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithConfig(tmpDir)

    const result = run(["run", "--dry-run"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("No changes to review")
  })

  test("respects --agents filter in dry-run", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithConfig(tmpDir)
    addStagedFile(tmpDir, "src/app.ts", "export const x = 1\n")

    const result = run(["run", "--dry-run", "--agents", "security"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("security")
    // bugs should not appear as an active agent
    expect(result.stdout).toContain("agents:   1")
  })

  test("respects --unstaged mode in dry-run", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithConfig(tmpDir)
    // Commit a file, then modify without staging
    addModifiedFile(tmpDir, "src/app.ts", "old\n", "new\n")
    // Unstage — we need unstaged changes
    const cp = require("child_process")
    cp.spawnSync("git", ["reset", "HEAD", "src/app.ts"], { cwd: tmpDir })

    const result = run(["run", "--dry-run", "--unstaged"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("unstaged")
  })

  test("respects --no-verify in dry-run", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithConfig(tmpDir)
    addStagedFile(tmpDir, "src/a.ts", "const x = 1\n")

    const result = run(["run", "--dry-run", "--no-verify"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("verify:   false")
  })

  test("respects --no-context in dry-run", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithConfig(tmpDir)
    addStagedFile(tmpDir, "src/a.ts", "const x = 1\n")

    const result = run(["run", "--dry-run", "--no-context"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("context:  diff only")
  })

  test("shows output format in dry-run", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithConfig(tmpDir)
    addStagedFile(tmpDir, "src/a.ts", "const x = 1\n")

    const result = run(["run", "--dry-run", "--format", "sarif"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("output:   sarif")
  })
})

describe("openlens run (error cases)", () => {
  test("fails outside a git repository", () => {
    tmpDir = fs.mkdtempSync(path.join(require("os").tmpdir(), "openlens-nogit-"))
    writeConfig(tmpDir, { model: "anthropic/claude-sonnet-4-20250514" })

    const result = run(["run"], tmpDir)

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("Not a git repository")
  })

  test("falls back to defaults with malformed config JSON", () => {
    tmpDir = createTempGitRepo()
    fs.writeFileSync(path.join(tmpDir, "openlens.json"), "not valid json")

    const result = run(["run", "--dry-run"], tmpDir)

    // Invalid JSON is silently skipped by readJsonc — defaults apply
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("dry run")
  })
})
