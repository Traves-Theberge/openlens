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
} from "./helpers"

let tmpDir: string

afterEach(() => {
  if (tmpDir) cleanup(tmpDir)
})

describe("config: global config directory", () => {
  test("doctor reports config loading without crash when XDG_CONFIG_HOME is set", () => {
    tmpDir = createTempGitRepo()

    // Create a custom global config home
    const xdgHome = path.join(tmpDir, ".xdg-config")
    const globalDir = path.join(xdgHome, "openlens")
    fs.mkdirSync(globalDir, { recursive: true })
    fs.writeFileSync(
      path.join(globalDir, "openlens.json"),
      JSON.stringify({
        model: "opencode/big-pickle",
      })
    )

    const result = run(["doctor"], tmpDir, {
      XDG_CONFIG_HOME: xdgHome,
    })

    expect(result.exitCode).not.toBeUndefined()
    expect(result.stdout).toContain("Doctor")
  })

  test("project config agents are visible in agent list", () => {
    tmpDir = createTempGitRepo()

    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      agent: {
        "project-agent": {
          description: "Project agent",
          prompt: "Project reviewer.",
        },
      },
      disabled_agents: ["security", "bugs", "performance", "style"],
    })

    const result = run(["agent", "list"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("project-agent")
  })
})

describe("config: environment variable overrides", () => {
  test("OPENLENS_MODEL overrides config model in dry-run", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      agent: {
        test: { description: "Test", prompt: "Reviewer." },
      },
      disabled_agents: ["security", "bugs", "performance", "style"],
    })
    addStagedFile(tmpDir, "src/app.ts", "const x = 1\n")

    const result = run(["run", "--dry-run"], tmpDir, {
      OPENLENS_MODEL: "openai/gpt-4o",
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("openai/gpt-4o")
  })

  test("CLI -m flag overrides both config and env model", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      agent: {
        test: { description: "Test", prompt: "Reviewer." },
      },
      disabled_agents: ["security", "bugs", "performance", "style"],
    })
    addStagedFile(tmpDir, "src/app.ts", "const x = 1\n")

    const result = run(
      ["run", "--dry-run", "-m", "anthropic/claude-sonnet-4-20250514"],
      tmpDir,
      { OPENLENS_MODEL: "openai/gpt-4o" }
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("anthropic/claude-sonnet-4-20250514")
  })
})

describe("config: invalid/edge cases", () => {
  test("empty openlens.json is treated as valid", () => {
    tmpDir = createTempGitRepo()
    fs.writeFileSync(path.join(tmpDir, "openlens.json"), "{}\n")

    const result = run(["agent", "list"], tmpDir)

    // Should not crash — empty config falls back to defaults
    expect(result.exitCode).toBe(0)
  })

  test("config with extra unknown fields is accepted", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      unknownField: "should be stripped",
      agent: {
        test: { description: "Test", prompt: "Reviewer." },
      },
    })

    const result = run(["agent", "list"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("test")
  })

  test("config with review.maxConcurrency is accepted", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      agent: {
        test: { description: "Test", prompt: "Reviewer." },
      },
      review: {
        maxConcurrency: 2,
        verify: false,
      },
      disabled_agents: ["security", "bugs", "performance", "style"],
    })
    addStagedFile(tmpDir, "src/app.ts", "const x = 1\n")

    const result = run(["run", "--dry-run"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("dry run")
  })

  test("config with server settings is accepted", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      server: {
        port: 5000,
        hostname: "0.0.0.0",
      },
    })

    const result = run(["doctor"], tmpDir)

    expect(result.exitCode).not.toBeUndefined()
    expect(result.stdout).toContain("Doctor")
  })

  test("JSONC config with comments works", () => {
    tmpDir = createTempGitRepo()
    fs.writeFileSync(
      path.join(tmpDir, "openlens.jsonc"),
      `{
  // This is a comment
  "model": "opencode/big-pickle",
  "agent": {
    "custom-agent": {
      "description": "Custom",
      "prompt": "Reviewer."
    }
  }
}
`
    )

    const result = run(["agent", "list"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("custom-agent")
  })
})

describe("config: disabled_agents", () => {
  test("disabled_agents array hides agents from list", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      disabled_agents: ["security", "performance"],
    })

    const result = run(["agent", "list"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).not.toContain("security")
    expect(result.stdout).not.toContain("performance")
  })

  test("disabled_agents don't appear in dry-run agent list", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      agent: {
        security: { description: "Scanner", prompt: "Reviewer." },
        bugs: { description: "Detector", prompt: "Reviewer." },
      },
      disabled_agents: ["security", "performance", "style"],
    })
    addStagedFile(tmpDir, "src/app.ts", "const x = 1\n")

    const result = run(["run", "--dry-run"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("bugs")
    // Security should not be in the agents section
    const agentsSection = result.stdout.split("agents:")[1]?.split("verify:")[0] || ""
    expect(agentsSection).not.toContain("security")
  })
})
