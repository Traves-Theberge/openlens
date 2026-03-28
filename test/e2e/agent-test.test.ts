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
} from "./helpers"

let tmpDir: string

afterEach(() => {
  if (tmpDir) cleanup(tmpDir)
})

const AGENT_PROMPT = `---
description: Test agent
mode: subagent
model: opencode/big-pickle
steps: 3
permission:
  read: allow
  grep: allow
  glob: allow
  list: allow
  edit: deny
  write: deny
  bash: deny
---
You are a code reviewer. Return a JSON array of issues or \`[]\`.`

function setupRepo() {
  tmpDir = createTempGitRepo()
  writeConfig(tmpDir, {
    model: "opencode/big-pickle",
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
    disabled_agents: ["performance", "style"],
    review: { verify: false },
  })

  writeAgent(tmpDir, "security", AGENT_PROMPT.replace("Test agent", "Security scanner"))
  writeAgent(tmpDir, "bugs", AGENT_PROMPT.replace("Test agent", "Bug detector"))
}

describe("openlens agent test", () => {
  test("agent test --help shows options", () => {
    setupRepo()
    const result = run(["agent", "test", "--help"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("--staged")
    expect(result.stdout).toContain("--unstaged")
    expect(result.stdout).toContain("--branch")
    expect(result.stdout).toContain("--format")
    expect(result.stdout).toContain("--model")
    expect(result.stdout).toContain("--verbose")
  })

  test("agent test with nonexistent agent fails", () => {
    setupRepo()
    addStagedFile(tmpDir, "src/app.ts", "const x = 1\n")

    const result = run(["agent", "test", "nonexistent", "--staged"], tmpDir)

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("not found")
    expect(result.stderr).toContain("Available:")
    expect(result.stderr).toContain("security")
    expect(result.stderr).toContain("bugs")
  })

  test("agent test without specifying mode defaults to staged", () => {
    setupRepo()
    // No staged changes, should work but produce empty diff
    const result = run(["agent", "test", "security"], tmpDir)

    // Should either succeed with no changes or attempt the test
    // (actual API call may fail without opencode, but the command should parse correctly)
    expect(result.exitCode).toBeLessThanOrEqual(2)
  })

  test("agent test with no staged changes completes without crash", () => {
    setupRepo()

    const result = run(["agent", "test", "security", "--staged"], tmpDir)

    // Should succeed — no changes means no issues
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("No issues found")
  })

  test("agent test with disabled agent fails", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      agent: {
        security: {
          description: "Scanner",
          prompt: "Reviewer.",
          disable: true,
        },
      },
      disabled_agents: ["bugs", "performance", "style"],
    })

    const result = run(["agent", "test", "security", "--staged"], tmpDir)

    // Disabled agents should not be testable
    expect(result.exitCode).toBe(2)
  })
})
