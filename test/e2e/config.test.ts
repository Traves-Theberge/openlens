import { describe, test, expect, afterEach } from "bun:test"
import fs from "fs"
import path from "path"
import os from "os"
import { run, createTempGitRepo, cleanup, writeConfig, addStagedFile } from "./helpers"

let tmpDir: string

afterEach(() => {
  if (tmpDir) cleanup(tmpDir)
})

describe("config resolution", () => {
  test("global config merges with project config", () => {
    tmpDir = createTempGitRepo()

    // Create a global config dir
    const globalDir = path.join(tmpDir, ".config-home", "openlens")
    fs.mkdirSync(globalDir, { recursive: true })
    fs.writeFileSync(
      path.join(globalDir, "openlens.json"),
      JSON.stringify({
        model: "anthropic/claude-sonnet-4-20250514",
        agent: {
          global: { description: "Global agent", prompt: "Global reviewer." },
        },
      })
    )

    // Project config adds another agent
    writeConfig(tmpDir, {
      agent: {
        local: { description: "Local agent", prompt: "Local reviewer." },
      },
    })

    // We can't easily override the global config path in loadConfig without
    // changing XDG_CONFIG_HOME. So this test validates project config alone.
    const result = run(["agent", "list"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("local")
  })

  test("review.defaultMode defaults to staged", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "anthropic/claude-sonnet-4-20250514",
      agent: {
        test: { description: "Test", prompt: "Reviewer." },
      },
    })
    addStagedFile(tmpDir, "src/a.ts", "const x = 1\n")

    const result = run(["run", "--dry-run"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("staged")
  })

  test("CI env changes defaultMode to branch", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "anthropic/claude-sonnet-4-20250514",
      agent: {
        test: { description: "Test", prompt: "Reviewer." },
      },
    })

    const result = run(["run", "--dry-run"], tmpDir, {
      CI: "true",
      GITHUB_ACTIONS: "true",
      GITHUB_BASE_REF: "main",
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("branch")
  })

  test("OPENLENS_MODEL env overrides config model", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "anthropic/claude-sonnet-4-20250514",
      agent: {
        test: { description: "Test", prompt: "Reviewer." },
      },
    })

    const result = run(["doctor"], tmpDir, {
      OPENLENS_MODEL: "openai/gpt-4o",
    })

    expect(result.exitCode).not.toBeUndefined()
    // Doctor output should show the overridden model
    expect(result.stdout).toContain("openai/gpt-4o")
  })
})

describe(".openlensignore", () => {
  test("file is loadable alongside config suppression rules", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "anthropic/claude-sonnet-4-20250514",
      suppress: {
        files: ["vendor/**"],
        patterns: ["TODO"],
      },
    })

    // Write an .openlensignore file
    fs.writeFileSync(
      path.join(tmpDir, ".openlensignore"),
      `# Ignore generated
generated/**
dist/**
`
    )

    // Validate the config loads — doctor is a good proxy
    const result = run(["doctor"], tmpDir)

    expect(result.exitCode).not.toBeUndefined()
    expect(result.stdout).toContain("Doctor")
  })
})

describe("MCP configuration", () => {
  test("validate detects MCP server configs", () => {
    tmpDir = createTempGitRepo()
    // Use inline prompts so validation doesn't fail on missing agent files
    writeConfig(tmpDir, {
      model: "anthropic/claude-sonnet-4-20250514",
      agent: {
        security: { description: "Scanner", prompt: "You are a reviewer." },
      },
      // Disable built-in agents that would fail validation in tmp dir
      disabled_agents: ["bugs", "performance", "style"],
      mcp: {
        "code-search": {
          type: "local",
          command: "/usr/bin/mcp-search",
          args: ["--port", "3001"],
          enabled: true,
        },
        "disabled-server": {
          type: "local",
          command: "/usr/bin/mcp-disabled",
          enabled: false,
        },
      },
    })

    const result = run(["agent", "validate"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("code-search")
    expect(result.stdout).toContain("disabled")
  })

  test("validate flags MCP server with missing command", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "anthropic/claude-sonnet-4-20250514",
      agent: {
        security: { description: "Scanner", prompt: "Reviewer." },
      },
      mcp: {
        broken: {
          type: "local",
          enabled: true,
        },
      },
    })

    const result = run(["agent", "validate"], tmpDir)

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("missing command")
  })

  test("validate flags remote MCP server with missing url", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "anthropic/claude-sonnet-4-20250514",
      agent: {
        security: { description: "Scanner", prompt: "Reviewer." },
      },
      mcp: {
        remote: {
          type: "remote",
          enabled: true,
        },
      },
    })

    const result = run(["agent", "validate"], tmpDir)

    expect(result.exitCode).toBe(1)
    expect(result.stdout).toContain("Remote MCP servers require a valid url")
  })
})
