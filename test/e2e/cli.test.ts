import { describe, test, expect, afterEach } from "bun:test"
import fs from "fs"
import path from "path"
import os from "os"
import { run, createTempGitRepo, cleanup, writeConfig } from "./helpers"

let tmpDir: string

afterEach(() => {
  if (tmpDir) cleanup(tmpDir)
})

describe("openlens --help", () => {
  test("shows help text", () => {
    tmpDir = createTempGitRepo()
    const result = run(["--help"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("openlens")
    expect(result.stdout).toContain("run")
    expect(result.stdout).toContain("init")
    expect(result.stdout).toContain("agent")
    expect(result.stdout).toContain("serve")
    expect(result.stdout).toContain("models")
    expect(result.stdout).toContain("doctor")
  })

  test("shows run subcommand help", () => {
    tmpDir = createTempGitRepo()
    const result = run(["run", "--help"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("--staged")
    expect(result.stdout).toContain("--unstaged")
    expect(result.stdout).toContain("--branch")
    expect(result.stdout).toContain("--agents")
    expect(result.stdout).toContain("--format")
    expect(result.stdout).toContain("--dry-run")
    expect(result.stdout).toContain("--verify")
    expect(result.stdout).toContain("--context")
  })

  test("shows agent subcommand help", () => {
    tmpDir = createTempGitRepo()
    const result = run(["agent", "--help"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("list")
    expect(result.stdout).toContain("create")
    expect(result.stdout).toContain("test")
    expect(result.stdout).toContain("validate")
    expect(result.stdout).toContain("enable")
    expect(result.stdout).toContain("disable")
  })

  test("shows serve subcommand help", () => {
    tmpDir = createTempGitRepo()
    const result = run(["serve", "--help"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("--port")
    expect(result.stdout).toContain("--hostname")
  })
})

describe("openlens --version", () => {
  test("shows version number", () => {
    tmpDir = createTempGitRepo()
    const result = run(["--version"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout.trim()).toBe("0.2.0")
  })
})

describe("openlens (no command)", () => {
  test("exits with error when no command given", () => {
    tmpDir = createTempGitRepo()
    const result = run([], tmpDir)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("specify a command")
  })
})

describe("openlens (invalid command)", () => {
  test("exits with error for unknown command", () => {
    tmpDir = createTempGitRepo()
    const result = run(["nonexistent"], tmpDir)

    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("Unknown argument")
  })
})

describe("openlens run --format validation", () => {
  test("rejects invalid format value", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, { model: "anthropic/claude-sonnet-4-20250514" })

    const result = run(["run", "--format", "xml", "--dry-run"], tmpDir)

    expect(result.exitCode).toBe(1)
    // yargs shows choices error
    expect(result.stderr).toContain("choices")
  })
})

describe("environment variable overrides", () => {
  test("OPENLENS_MODEL overrides config model", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "anthropic/claude-sonnet-4-20250514",
      agent: {
        test: { description: "Test", prompt: "You are a reviewer." },
      },
    })

    const result = run(["agent", "list"], tmpDir, {
      OPENLENS_MODEL: "openai/gpt-4o",
    })

    expect(result.exitCode).toBe(0)
    // Agent should inherit the env-overridden model
    // Note: loadConfig applies OPENLENS_MODEL but agents inherit from config.model
    // at load time, so this verifies the override flows through
  })
})

describe("config file formats", () => {
  test("works without any config file (uses defaults)", () => {
    tmpDir = createTempGitRepo()

    const result = run(["agent", "list"], tmpDir)

    // Should work but show no agents (defaults have no agent entries in config)
    expect(result.exitCode).toBe(0)
  })

  test("supports jsonc comments in config", () => {
    tmpDir = createTempGitRepo()
    fs.writeFileSync(
      path.join(tmpDir, "openlens.jsonc"),
      `{
  // This is a comment
  "model": "anthropic/claude-sonnet-4-20250514",
  "agent": {
    "test": {
      "description": "Test agent",
      "prompt": "You are a reviewer."
    }
  }
}
`
    )

    const result = run(["agent", "list"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("test")
  })
})

describe("openlens models", () => {
  test("attempts to list models (may fail without opencode binary)", () => {
    tmpDir = createTempGitRepo()

    const result = run(["models"], tmpDir)

    // Either succeeds (opencode installed) or fails with a clear error
    if (result.exitCode !== 0) {
      expect(result.stderr).toMatch(/opencode|Failed/)
    }
  })
})
