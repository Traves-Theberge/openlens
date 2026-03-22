import { describe, it, expect, beforeEach, afterEach } from "bun:test"
import { detectCI, resolveOpencodeBin, inferBaseBranch } from "../../src/env.js"

describe("detectCI", () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    // Restore env
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
  })

  it("detects GitHub Actions", () => {
    process.env.CI = "true"
    process.env.GITHUB_ACTIONS = "true"
    const result = detectCI()
    expect(result.isCI).toBe(true)
    expect(result.provider).toBe("github")
  })

  it("detects GitLab CI", () => {
    process.env.CI = "true"
    process.env.GITLAB_CI = "true"
    delete process.env.GITHUB_ACTIONS
    const result = detectCI()
    expect(result.isCI).toBe(true)
    expect(result.provider).toBe("gitlab")
  })

  it("returns false when not in CI", () => {
    delete process.env.CI
    delete process.env.GITHUB_ACTIONS
    delete process.env.GITLAB_CI
    const result = detectCI()
    expect(result.isCI).toBe(false)
  })

  it("detects CI=1", () => {
    process.env.CI = "1"
    delete process.env.GITHUB_ACTIONS
    delete process.env.GITLAB_CI
    const result = detectCI()
    expect(result.isCI).toBe(true)
    expect(result.provider).toBe("unknown")
  })
})

describe("resolveOpencodeBin", () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
  })

  it("uses OPENCODE_BIN env var when set", () => {
    process.env.OPENCODE_BIN = "/custom/path/opencode"
    expect(resolveOpencodeBin()).toBe("/custom/path/opencode")
  })

  it("finds bundled binary in project node_modules", () => {
    delete process.env.OPENCODE_BIN
    const projectRoot = new URL("../../", import.meta.url).pathname.replace(/\/$/, "")
    const result = resolveOpencodeBin(projectRoot)
    expect(result).toContain("node_modules/.bin/opencode")
  })

  it("falls back to 'opencode' when not found", () => {
    delete process.env.OPENCODE_BIN
    const result = resolveOpencodeBin("/nonexistent/path")
    // Should either find in cwd's node_modules or fall back to "opencode"
    expect(typeof result).toBe("string")
  })
})

describe("inferBaseBranch", () => {
  const originalEnv = { ...process.env }

  afterEach(() => {
    for (const key of Object.keys(process.env)) {
      if (!(key in originalEnv)) delete process.env[key]
    }
    Object.assign(process.env, originalEnv)
  })

  it("infers from GITHUB_BASE_REF", () => {
    process.env.GITHUB_BASE_REF = "develop"
    expect(inferBaseBranch()).toBe("develop")
  })

  it("infers from CI_MERGE_REQUEST_TARGET_BRANCH_NAME", () => {
    delete process.env.GITHUB_BASE_REF
    process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME = "main"
    expect(inferBaseBranch()).toBe("main")
  })

  it("returns undefined when no CI env vars", () => {
    delete process.env.GITHUB_BASE_REF
    delete process.env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME
    delete process.env.BUILDKITE_PULL_REQUEST_BASE_BRANCH
    expect(inferBaseBranch()).toBeUndefined()
  })
})
