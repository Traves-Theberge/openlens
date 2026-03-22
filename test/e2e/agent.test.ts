import { describe, test, expect, afterEach } from "bun:test"
import fs from "fs"
import path from "path"
import {
  run,
  createTempGitRepo,
  cleanup,
  writeConfig,
  writeAgent,
} from "./helpers"

let tmpDir: string

afterEach(() => {
  if (tmpDir) cleanup(tmpDir)
})

const AGENT_CONTENT = `---
description: Test agent
mode: subagent
model: anthropic/claude-sonnet-4-20250514
steps: 5
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

function setupRepo(dir: string) {
  writeConfig(dir, {
    model: "anthropic/claude-sonnet-4-20250514",
    agent: {
      security: {
        description: "Security vulnerability scanner",
        prompt: "{file:./agents/security.md}",
        steps: 5,
      },
      bugs: {
        description: "Bug and logic error detector",
        prompt: "{file:./agents/bugs.md}",
        steps: 5,
      },
    },
  })
  writeAgent(dir, "security", AGENT_CONTENT)
  writeAgent(dir, "bugs", AGENT_CONTENT)
}

describe("openlens agent list", () => {
  test("lists configured agents", () => {
    tmpDir = createTempGitRepo()
    setupRepo(tmpDir)

    const result = run(["agent", "list"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("security")
    expect(result.stdout).toContain("bugs")
    expect(result.stdout).toContain("model:")
    expect(result.stdout).toContain("mode:")
    expect(result.stdout).toContain("steps:")
  })

  test("shows default agents when no custom agents configured", () => {
    tmpDir = createTempGitRepo()
    // Config with empty agent block — built-in defaults still apply via loadConfig
    writeConfig(tmpDir, { model: "anthropic/claude-sonnet-4-20250514", agent: {} })

    const result = run(["agent", "list"], tmpDir)

    expect(result.exitCode).toBe(0)
    // Built-in default agents are still loaded
    expect(result.stdout).toContain("security")
    expect(result.stdout).toContain("bugs")
    expect(result.stdout).toContain("performance")
    expect(result.stdout).toContain("style")
  })

  test("shows no agents when all are disabled", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "anthropic/claude-sonnet-4-20250514",
      disabled_agents: ["security", "bugs", "performance", "style"],
    })

    const result = run(["agent", "list"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("No agents configured")
  })

  test("hides disabled agents", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "anthropic/claude-sonnet-4-20250514",
      agent: {
        security: { description: "Scanner", prompt: "inline prompt" },
        bugs: { description: "Detector", prompt: "inline prompt", disable: true },
      },
    })

    const result = run(["agent", "list"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("security")
    expect(result.stdout).not.toContain("bugs")
  })

  test("shows allowed tools", () => {
    tmpDir = createTempGitRepo()
    setupRepo(tmpDir)

    const result = run(["agent", "list"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("allowed:")
    expect(result.stdout).toContain("read")
  })
})

describe("openlens agent create", () => {
  test("creates a new agent file and updates config", () => {
    tmpDir = createTempGitRepo()
    setupRepo(tmpDir)

    const result = run(
      ["agent", "create", "a11y", "--description", "Accessibility checker"],
      tmpDir
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("created")
    expect(result.stdout).toContain("agents/a11y.md")

    // Agent file should exist with frontmatter
    const agentPath = path.join(tmpDir, "agents", "a11y.md")
    expect(fs.existsSync(agentPath)).toBe(true)
    const content = fs.readFileSync(agentPath, "utf-8")
    expect(content).toContain("description: Accessibility checker")
    expect(content).toContain("mode: subagent")
    expect(content).toContain("read: allow")
    expect(content).toContain("bash: deny")

    // Config should be updated
    const config = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "openlens.json"), "utf-8")
    )
    expect(config.agent.a11y).toBeDefined()
    expect(config.agent.a11y.description).toBe("Accessibility checker")
  })

  test("respects --model and --steps flags", () => {
    tmpDir = createTempGitRepo()
    setupRepo(tmpDir)

    const result = run(
      ["agent", "create", "perf", "--model", "openai/gpt-4o", "--steps", "3"],
      tmpDir
    )

    expect(result.exitCode).toBe(0)

    const content = fs.readFileSync(
      path.join(tmpDir, "agents", "perf.md"),
      "utf-8"
    )
    expect(content).toContain("model: openai/gpt-4o")
    expect(content).toContain("steps: 3")
  })

  test("refuses to create agent with invalid name", () => {
    tmpDir = createTempGitRepo()
    setupRepo(tmpDir)

    const result = run(["agent", "create", "InvalidName"], tmpDir)

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("lowercase")
  })

  test("refuses to overwrite existing agent", () => {
    tmpDir = createTempGitRepo()
    setupRepo(tmpDir)

    const result = run(["agent", "create", "security"], tmpDir)

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("already exists")
  })

  test("creates agents directory if it does not exist", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "anthropic/claude-sonnet-4-20250514",
      agent: {},
    })

    const result = run(["agent", "create", "custom"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(fs.existsSync(path.join(tmpDir, "agents", "custom.md"))).toBe(true)
  })
})

describe("openlens agent validate", () => {
  test("validates correct configuration with inline prompts", () => {
    tmpDir = createTempGitRepo()
    // Use inline prompts and disable built-in defaults (whose file prompts
    // would fail in the temp dir)
    writeConfig(tmpDir, {
      model: "anthropic/claude-sonnet-4-20250514",
      agent: {
        security: { description: "Scanner", prompt: "You are a security reviewer." },
        bugs: { description: "Detector", prompt: "You are a bug detector." },
      },
      disabled_agents: ["performance", "style"],
    })

    const result = run(["agent", "validate"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("security")
    expect(result.stdout).toContain("bugs")
  })

  test("validates correct configuration with file prompts", () => {
    tmpDir = createTempGitRepo()
    setupRepo(tmpDir)

    const result = run(["agent", "validate"], tmpDir)

    // All agents should pass validation (prompt files exist)
    expect(result.stdout).toContain("security")
    expect(result.stdout).toContain("bugs")
  })

  test("reports error for missing prompt file", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "anthropic/claude-sonnet-4-20250514",
      agent: {
        broken: {
          description: "Missing prompt",
          prompt: "{file:./agents/nonexistent.md}",
        },
      },
    })

    const result = run(["agent", "validate"], tmpDir)

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("not found")
  })

  test("reports error for missing provider prefix in model", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "anthropic/claude-sonnet-4-20250514",
      agent: {
        bad: {
          description: "Bad model",
          prompt: "You are a reviewer.",
          model: "claude-sonnet",
        },
      },
    })

    const result = run(["agent", "validate"], tmpDir)

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("missing provider prefix")
  })

  test("reports warning when all agents are disabled", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "anthropic/claude-sonnet-4-20250514",
      disabled_agents: ["security", "bugs", "performance", "style"],
    })

    const result = run(["agent", "validate"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("No agents configured")
  })
})

describe("openlens agent enable/disable", () => {
  test("disables an agent", () => {
    tmpDir = createTempGitRepo()
    setupRepo(tmpDir)

    const result = run(["agent", "disable", "security"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("disabled")

    const config = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "openlens.json"), "utf-8")
    )
    expect(config.agent.security.disable).toBe(true)
  })

  test("enables a disabled agent", () => {
    tmpDir = createTempGitRepo()
    setupRepo(tmpDir)

    // Disable first
    run(["agent", "disable", "security"], tmpDir)

    // Then enable
    const result = run(["agent", "enable", "security"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("enabled")

    const config = JSON.parse(
      fs.readFileSync(path.join(tmpDir, "openlens.json"), "utf-8")
    )
    expect(config.agent.security.disable).toBeUndefined()
  })

  test("fails for nonexistent agent", () => {
    tmpDir = createTempGitRepo()
    setupRepo(tmpDir)

    const result = run(["agent", "disable", "nonexistent"], tmpDir)

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("not found")
  })

  test("fails without openlens.json", () => {
    tmpDir = createTempGitRepo()

    const result = run(["agent", "disable", "security"], tmpDir)

    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("openlens.json not found")
  })
})

describe("openlens agent (no subcommand)", () => {
  test("shows usage when no subcommand given", () => {
    tmpDir = createTempGitRepo()
    const result = run(["agent"], tmpDir)

    // yargs exits with 1 when a required subcommand is missing
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("openlens agent")
  })
})
