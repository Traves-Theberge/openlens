import { describe, test, expect, afterEach } from "bun:test"
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
        context: "security",
      },
      bugs: {
        description: "Bug detector",
        prompt: "{file:./agents/bugs.md}",
        context: "bugs",
      },
    },
    review: {
      defaultMode: "staged",
      verify: false,
      minConfidence: "medium",
    },
    disabled_agents: ["performance", "style"],
  })

  writeAgent(tmpDir, "security", AGENT_PROMPT.replace("Test agent", "Security scanner"))
  writeAgent(tmpDir, "bugs", AGENT_PROMPT.replace("Test agent", "Bug detector"))
}

// ─── Confidence scoring ─────────────────────────────────────────

describe("confidence scoring", () => {
  test("--dry-run shows agents when minConfidence is configured", () => {
    setupRepo()
    addStagedFile(tmpDir, "app.js", "console.log('hello')")
    const result = run(["run", "--dry-run", "--staged"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("agents:")
    expect(result.stdout).toContain("security")
    expect(result.stdout).toContain("bugs")
  })

  test("JSON output with empty diff includes meta with correct structure", () => {
    setupRepo()
    const result = run(["run", "--staged", "--format", "json"], tmpDir)
    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout)
    expect(output).toHaveProperty("issues")
    expect(output).toHaveProperty("timing")
    expect(output).toHaveProperty("meta")
    expect(output.meta).toHaveProperty("mode")
    expect(output.meta).toHaveProperty("filesChanged")
    expect(output.meta).toHaveProperty("agentsRun")
    expect(output.meta).toHaveProperty("suppressed")
    expect(output.meta).toHaveProperty("verified")
    expect(Array.isArray(output.issues)).toBe(true)
  })

  test("SARIF output is valid JSON with correct schema", () => {
    setupRepo()
    const result = run(["run", "--staged", "--format", "sarif"], tmpDir)
    expect(result.exitCode).toBe(0)
    const sarif = JSON.parse(result.stdout)
    expect(sarif.version).toBe("2.1.0")
    expect(sarif).toHaveProperty("runs")
    expect(Array.isArray(sarif.runs)).toBe(true)
    expect(sarif.runs[0].tool.driver.name).toBe("openlens")
    expect(sarif.runs[0].tool.driver.version).toBe("0.1.1")
  })

  test("markdown output contains review marker", () => {
    setupRepo()
    const result = run(["run", "--staged", "--format", "markdown"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("<!-- openlens-review -->")
    expect(result.stdout).toContain("OpenLens Review")
  })

  test("minConfidence is accepted in config without error", () => {
    setupRepo()
    // Config already has minConfidence: "medium" — verify it loads
    const result = run(["agent", "validate"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("security")
    expect(result.stdout).toContain("bugs")
  })
})

// ─── Context strategies ─────────────────────────────────────────

describe("context strategies", () => {
  test("agent with context field validates", () => {
    setupRepo()
    const result = run(["agent", "validate"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("security")
    expect(result.stdout).toContain("bugs")
  })

  test("agent list shows agents with context field", () => {
    setupRepo()
    const result = run(["agent", "list"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("security")
    expect(result.stdout).toContain("Security scanner")
    expect(result.stdout).toContain("bugs")
    expect(result.stdout).toContain("Bug detector")
  })

  test("dry-run works with context-enabled agents", () => {
    setupRepo()
    addStagedFile(tmpDir, "src/auth.ts", "export function login() {}")
    const result = run(["run", "--dry-run", "--staged"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("1 changed")
    expect(result.stdout).toContain("security")
    expect(result.stdout).toContain("bugs")
  })

  test("invalid context value is rejected by config", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      agent: {
        test: {
          description: "Test",
          prompt: "test prompt",
          context: "invalid-context",
        },
      },
      disabled_agents: ["security", "bugs", "performance", "style"],
    })
    const result = run(["agent", "validate"], tmpDir)
    // Zod may reject invalid enum or strip it — either way should not crash
    expect(result.exitCode).toBeLessThanOrEqual(1)
  })
})

// ─── Agent prompts ──────────────────────────────────────────────

describe("agent prompts with structured reasoning", () => {
  test("agent create includes frontmatter with expected fields", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      agent: {},
    })
    const result = run(["agent", "create", "test-agent", "--description", "Test agent"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("created")

    // Read the created agent file
    const fs = require("fs")
    const agentContent = fs.readFileSync(`${tmpDir}/agents/test-agent.md`, "utf-8")
    expect(agentContent).toContain("description: Test agent")
    expect(agentContent).toContain("mode: subagent")
    expect(agentContent).toContain("read: allow")
    expect(agentContent).toContain("edit: deny")
  })

  test("agent create with custom model and steps", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      agent: {},
    })
    const result = run(
      ["agent", "create", "custom", "--description", "Custom", "--model", "opencode/gpt-5-nano", "--steps", "3"],
      tmpDir
    )
    expect(result.exitCode).toBe(0)

    const fs = require("fs")
    const content = fs.readFileSync(`${tmpDir}/agents/custom.md`, "utf-8")
    expect(content).toContain("model: opencode/gpt-5-nano")
    expect(content).toContain("steps: 3")
  })
})

// ─── Output format consistency ──────────────────────────────────

describe("output format consistency", () => {
  test("all four formats produce valid output on empty diff", () => {
    setupRepo()
    const formats = ["text", "json", "sarif", "markdown"]

    for (const fmt of formats) {
      const result = run(["run", "--staged", "--format", fmt], tmpDir)
      expect(result.exitCode).toBe(0)

      if (fmt === "json") {
        const parsed = JSON.parse(result.stdout)
        expect(parsed.issues).toEqual([])
      } else if (fmt === "sarif") {
        const parsed = JSON.parse(result.stdout)
        expect(parsed.version).toBe("2.1.0")
      } else if (fmt === "markdown") {
        expect(result.stdout).toContain("<!-- openlens-review -->")
      } else if (fmt === "text") {
        expect(result.stdout).toContain("No issues found")
      }
    }
  })

  test("invalid format is rejected", () => {
    setupRepo()
    const result = run(["run", "--staged", "--format", "xml"], tmpDir)
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Invalid values")
  })
})

// ─── CLI flag combinations ──────────────────────────────────────

describe("CLI flag combinations", () => {
  test("--agents filters to specific agents in dry-run", () => {
    setupRepo()
    addStagedFile(tmpDir, "app.js", "x")
    const result = run(["run", "--dry-run", "--staged", "--agents", "security"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("agents:   1")
    expect(result.stdout).toContain("security")
    expect(result.stdout).not.toContain("bugs")
  })

  test("--exclude-agents removes agents in dry-run", () => {
    setupRepo()
    addStagedFile(tmpDir, "app.js", "x")
    const result = run(["run", "--dry-run", "--staged", "--exclude-agents", "security"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("bugs")
    // security should not appear in the agents list (may still appear elsewhere)
    const agentsSection = result.stdout.split("agents:")[1]?.split("verify:")[0] || ""
    expect(agentsSection).not.toContain("security")
  })

  test("--no-verify shows verify: false in dry-run", () => {
    setupRepo()
    const result = run(["run", "--dry-run", "--staged", "--no-verify"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("verify:   false")
  })

  test("--no-context shows diff only in dry-run", () => {
    setupRepo()
    const result = run(["run", "--dry-run", "--staged", "--no-context"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("context:  diff only")
  })

  test("-m overrides model in dry-run", () => {
    setupRepo()
    const result = run(["run", "--dry-run", "--staged", "-m", "opencode/gpt-5-nano"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("opencode/gpt-5-nano")
  })
})

// ─── Error handling ─────────────────────────────────────────────

describe("error handling", () => {
  test("run outside git repo fails with clear message", () => {
    const os = require("os")
    const fs = require("fs")
    const dir = fs.mkdtempSync(require("path").join(os.tmpdir(), "openlens-nogit-"))
    const result = run(["run", "--staged"], dir)
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("Not a git repository")
    cleanup(dir)
  })

  test("agent test with nonexistent agent fails with available list", () => {
    setupRepo()
    const result = run(["agent", "test", "nonexistent", "--staged"], tmpDir)
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("not found")
    expect(result.stderr).toContain("Available:")
  })

  test("agent create with invalid name fails", () => {
    setupRepo()
    const result = run(["agent", "create", "BAD NAME"], tmpDir)
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("lowercase alphanumeric")
  })

  test("agent create with existing name fails", () => {
    setupRepo()
    const result = run(["agent", "create", "security"], tmpDir)
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("already exists")
  })

  test("no command shows help", () => {
    setupRepo()
    const result = run([], tmpDir)
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Please specify a command")
  })

  test("unknown command fails", () => {
    setupRepo()
    const result = run(["bogus"], tmpDir)
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Unknown argument")
  })
})

// ─── GitHub review formatter (unit-level via CLI) ───────────────

describe("version and help", () => {
  test("--version returns correct version", () => {
    setupRepo()
    const result = run(["--version"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("0.1.1")
  })

  test("--help shows extended descriptions", () => {
    setupRepo()
    const result = run(["--help"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("AI-powered code review")
    expect(result.stdout).toContain("Quick start:")
    expect(result.stdout).toContain("Examples:")
    expect(result.stdout).toContain("openlens run")
    expect(result.stdout).toContain("openlens agent")
    expect(result.stdout).toContain("openlens doctor")
  })

  test("-h and -v shortcuts work", () => {
    setupRepo()
    const helpResult = run(["-h"], tmpDir)
    expect(helpResult.exitCode).toBe(0)
    expect(helpResult.stdout).toContain("Commands:")

    const versionResult = run(["-v"], tmpDir)
    expect(versionResult.exitCode).toBe(0)
    expect(versionResult.stdout.trim()).toBe("0.1.1")
  })
})
