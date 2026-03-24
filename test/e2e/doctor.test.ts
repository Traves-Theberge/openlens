import { describe, test, expect, afterEach } from "bun:test"
import fs from "fs"
import path from "path"
import {
  run,
  createTempGitRepo,
  cleanup,
  writeConfig,
} from "./helpers"

let tmpDir: string

afterEach(() => {
  if (tmpDir) cleanup(tmpDir)
})

// Doctor runs `opencode --version` which may be slow — use longer timeouts
const TIMEOUT = { timeout: 30_000 }

describe("openlens doctor", () => {
  test("checks git is available", TIMEOUT, () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, { model: "anthropic/claude-sonnet-4-20250514" })

    const result = run(["doctor"], tmpDir)

    expect(result.stdout).toContain("git")
  })

  test("checks for opencode binary", TIMEOUT, () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, { model: "anthropic/claude-sonnet-4-20250514" })

    const result = run(["doctor"], tmpDir)

    expect(result.stdout).toContain("opencode")
  })

  test("checks API keys", TIMEOUT, () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, { model: "anthropic/claude-sonnet-4-20250514" })

    const result = run(["doctor"], tmpDir, {
      ANTHROPIC_API_KEY: "sk-test-key",
    })

    expect(result.stdout).toContain("ANTHROPIC_API_KEY")
  })

  test("validates config file", TIMEOUT, () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      agent: {
        security: { description: "Scanner" },
      },
    })

    const result = run(["doctor"], tmpDir)

    expect(result.stdout).toContain("config")
    expect(result.stdout).toContain("opencode/big-pickle")
  })

  test("reports loaded agents", TIMEOUT, () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "anthropic/claude-sonnet-4-20250514",
      agent: {
        security: { description: "Scanner", prompt: "You are a reviewer." },
        bugs: { description: "Detector", prompt: "You are a reviewer." },
      },
    })

    const result = run(["doctor"], tmpDir)

    expect(result.stdout).toContain("agents")
    expect(result.stdout).toContain("security")
    expect(result.stdout).toContain("bugs")
  })

  test("detects CI environment", TIMEOUT, () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, { model: "anthropic/claude-sonnet-4-20250514" })

    const result = run(["doctor"], tmpDir, {
      CI: "true",
      GITHUB_ACTIONS: "true",
    })

    expect(result.stdout).toContain("CI")
    expect(result.stdout).toContain("github")
  })

  test("handles missing config gracefully", TIMEOUT, () => {
    tmpDir = createTempGitRepo()

    const result = run(["doctor"], tmpDir)

    expect(result.stdout).toContain("Doctor")
  })
})
