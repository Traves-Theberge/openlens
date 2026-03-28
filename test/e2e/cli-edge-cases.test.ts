import { describe, test, expect, afterEach } from "bun:test"
import fs from "fs"
import path from "path"
import os from "os"
import {
  run,
  createTempGitRepo,
  cleanup,
  writeConfig,
  addStagedFile,
  addUnstagedFile,
  addModifiedFile,
} from "./helpers"

let tmpDir: string

afterEach(() => {
  if (tmpDir) cleanup(tmpDir)
})

function setupRepoWithAgents(dir: string) {
  writeConfig(dir, {
    model: "opencode/big-pickle",
    agent: {
      security: { description: "Security scanner", prompt: "You are a security reviewer." },
      bugs: { description: "Bug detector", prompt: "You are a bug detector." },
      performance: { description: "Perf reviewer", prompt: "You are a performance reviewer." },
      style: { description: "Style checker", prompt: "You are a style reviewer." },
    },
    review: {
      defaultMode: "staged",
      verify: false,
    },
  })
}

// ---------------------------------------------------------------------------
// 1. Conflicting diff mode flags
// ---------------------------------------------------------------------------
describe("conflicting diff mode flags", () => {
  test("--staged --unstaged is handled gracefully", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithAgents(tmpDir)
    addStagedFile(tmpDir, "src/app.ts", "const x = 1\n")

    const result = run(["run", "--staged", "--unstaged", "--dry-run"], tmpDir)

    // Should either pick one mode or report an error — not crash
    expect(result.exitCode).not.toBeNull()
    // No unhandled exception
    expect(result.stderr).not.toContain("TypeError")
    expect(result.stderr).not.toContain("Cannot read properties")
  })

  test("--staged --branch main is handled gracefully", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithAgents(tmpDir)
    addStagedFile(tmpDir, "src/app.ts", "const x = 1\n")

    const result = run(["run", "--staged", "--branch", "main", "--dry-run"], tmpDir)

    // Should either pick one mode or report an error — not crash
    expect(result.exitCode).not.toBeNull()
    expect(result.stderr).not.toContain("TypeError")
    expect(result.stderr).not.toContain("Cannot read properties")
  })
})

// ---------------------------------------------------------------------------
// 2. Multiple environment variable overrides
// ---------------------------------------------------------------------------
describe("multiple environment variable overrides", () => {
  test("CLI -m flag wins over OPENLENS_MODEL env var", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithAgents(tmpDir)
    addStagedFile(tmpDir, "src/app.ts", "const x = 1\n")

    const result = run(
      ["run", "--dry-run", "-m", "anthropic/claude-sonnet-4-20250514"],
      tmpDir,
      { OPENLENS_MODEL: "openai/gpt-4o" }
    )

    expect(result.exitCode).toBe(0)
    // CLI flag should take precedence
    expect(result.stdout).toContain("anthropic/claude-sonnet-4-20250514")
  })

  test("multiple OPENLENS_* env vars at once are accepted", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithAgents(tmpDir)
    addStagedFile(tmpDir, "src/app.ts", "const x = 1\n")

    const result = run(["run", "--dry-run"], tmpDir, {
      OPENLENS_MODEL: "openai/gpt-4o",
      OPENLENS_DEBUG: "1",
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("openai/gpt-4o")
  })
})

// ---------------------------------------------------------------------------
// 3. Config edge cases
// ---------------------------------------------------------------------------
describe("config edge cases", () => {
  test("empty JSON object config uses defaults", () => {
    tmpDir = createTempGitRepo()
    fs.writeFileSync(path.join(tmpDir, "openlens.json"), "{}\n")

    const result = run(["agent", "list"], tmpDir)

    // Should not crash — empty config falls back to built-in defaults
    expect(result.exitCode).toBe(0)
  })

  test("config with only disabled_agents and no agent section works", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      disabled_agents: ["performance", "style"],
    })

    const result = run(["agent", "list"], tmpDir)

    expect(result.exitCode).toBe(0)
    // Disabled agents should not appear
    expect(result.stdout).not.toContain("performance")
    expect(result.stdout).not.toContain("style")
  })

  test("config with unknown fields is accepted (Zod strips extras)", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      totallyFakeField: true,
      anotherUnknown: { nested: "value" },
      agent: {
        myagent: { description: "Test", prompt: "You are a reviewer." },
      },
    })

    const result = run(["agent", "list"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("myagent")
  })
})

// ---------------------------------------------------------------------------
// 4. Large file handling
// ---------------------------------------------------------------------------
describe("large file handling", () => {
  test("staging a file with 1000+ lines works in dry-run", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithAgents(tmpDir)

    // Generate a large file with 1500 lines
    const lines: string[] = []
    for (let i = 0; i < 1500; i++) {
      lines.push(`export const value_${i} = ${i};`)
    }
    addStagedFile(tmpDir, "src/big-module.ts", lines.join("\n") + "\n")

    const result = run(["run", "--dry-run"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("dry run")
    expect(result.stdout).toContain("big-module.ts")
    // Should report file stats (lines changed)
    expect(result.stdout).toContain("files:")
  })
})

// ---------------------------------------------------------------------------
// 5. Special characters in paths
// ---------------------------------------------------------------------------
describe("special characters in paths", () => {
  test("files with spaces in directory names appear in dry-run", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithAgents(tmpDir)

    addStagedFile(tmpDir, "my folder/app.ts", "export const x = 1\n")

    const result = run(["run", "--dry-run"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("my folder/app.ts")
  })

  test("files with special characters in names appear in dry-run", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithAgents(tmpDir)

    addStagedFile(tmpDir, "src/my-module_v2.ts", "export const x = 1\n")
    addStagedFile(tmpDir, "src/[utils].ts", "export const y = 2\n")

    const result = run(["run", "--dry-run"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("my-module_v2.ts")
    expect(result.stdout).toContain("[utils].ts")
  })
})

// ---------------------------------------------------------------------------
// 6. Multiple agents filtering
// ---------------------------------------------------------------------------
describe("multiple agents filtering", () => {
  test("--agents with comma-separated list filters correctly in dry-run", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithAgents(tmpDir)
    addStagedFile(tmpDir, "src/app.ts", "const x = 1\n")

    const result = run(["run", "--dry-run", "--agents", "security,bugs"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("security")
    expect(result.stdout).toContain("bugs")
    // Should only have 2 agents
    expect(result.stdout).toContain("agents:   2")
  })

  test("--exclude-agents with comma-separated list filters correctly in dry-run", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithAgents(tmpDir)
    addStagedFile(tmpDir, "src/app.ts", "const x = 1\n")

    const result = run(["run", "--dry-run", "--exclude-agents", "security,bugs"], tmpDir)

    expect(result.exitCode).toBe(0)
    // The excluded agents should not appear in the active agents section
    const agentsSection = result.stdout.split("agents:")[1]?.split("verify:")[0] || ""
    expect(agentsSection).not.toContain("security")
    expect(agentsSection).not.toContain("bugs")
    // performance and style should remain
    expect(result.stdout).toContain("performance")
    expect(result.stdout).toContain("style")
  })
})

// ---------------------------------------------------------------------------
// 7. Subcommand error boundaries
// ---------------------------------------------------------------------------
describe("subcommand error boundaries", () => {
  test("agent enable nonexistent fails gracefully", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithAgents(tmpDir)

    const result = run(["agent", "enable", "nonexistent"], tmpDir)

    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain("not found")
    // Should not crash with unhandled exception
    expect(result.stderr).not.toContain("TypeError")
  })

  test("agent disable nonexistent fails gracefully", () => {
    tmpDir = createTempGitRepo()
    setupRepoWithAgents(tmpDir)

    const result = run(["agent", "disable", "nonexistent"], tmpDir)

    expect(result.exitCode).not.toBe(0)
    expect(result.stderr).toContain("not found")
    expect(result.stderr).not.toContain("TypeError")
  })

  test("hooks install outside git repo fails gracefully", () => {
    const noGitDir = fs.mkdtempSync(path.join(os.tmpdir(), "openlens-nogit-"))

    try {
      const result = run(["hooks", "install"], noGitDir)

      expect(result.exitCode).not.toBe(0)
      expect(result.stderr).toContain("Not a git repository")
      expect(result.stderr).not.toContain("TypeError")
    } finally {
      cleanup(noGitDir)
    }
  })

  test("setup --config alone works", () => {
    tmpDir = createTempGitRepo()

    const result = run(["setup", "--config", "--yes"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(fs.existsSync(path.join(tmpDir, "openlens.json"))).toBe(true)

    const config = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "openlens.json"), "utf-8")
    )
    expect(config.model).toBeDefined()
  })
})
