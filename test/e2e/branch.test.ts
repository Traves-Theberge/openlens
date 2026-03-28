import { describe, test, expect, afterEach } from "bun:test"
import { spawnSync } from "child_process"
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

/**
 * Get the default branch name of the repo (master or main).
 */
function getDefaultBranch(dir: string): string {
  const result = spawnSync("git", ["branch", "--show-current"], {
    cwd: dir,
    encoding: "utf-8",
  })
  return (result.stdout || "").trim() || "master"
}

/**
 * Set up a repo where the default branch has a baseline, then create a feature branch with changes.
 * Config does NOT set defaultMode so CI auto-detection can override it.
 * Returns the name of the base branch.
 */
function setupBranchScenario(dir: string): string {
  const baseBranch = getDefaultBranch(dir)

  // Write config and commit on base branch
  writeConfig(dir, {
    model: "opencode/big-pickle",
    agent: {
      security: {
        description: "Security scanner",
        prompt: "You are a security reviewer. Return `[]`.",
      },
    },
    disabled_agents: ["bugs", "performance", "style"],
    review: { verify: false },
  })
  spawnSync("git", ["add", "."], { cwd: dir })
  spawnSync("git", ["commit", "-m", "add config on base branch"], { cwd: dir })

  // Create feature branch and add files
  spawnSync("git", ["checkout", "-b", "feature/auth"], { cwd: dir })

  const srcDir = path.join(dir, "src")
  fs.mkdirSync(srcDir, { recursive: true })
  fs.writeFileSync(
    path.join(srcDir, "auth.ts"),
    'export function login(user: string, pass: string) {\n  return user === "admin" && pass === "password"\n}\n'
  )
  fs.writeFileSync(
    path.join(srcDir, "utils.ts"),
    "export function hash(s: string) { return s.split('').reverse().join('') }\n"
  )
  spawnSync("git", ["add", "."], { cwd: dir })
  spawnSync("git", ["commit", "-m", "add auth module"], { cwd: dir })

  return baseBranch
}

describe("openlens run --branch", () => {
  test("dry-run shows branch mode and changed files", () => {
    tmpDir = createTempGitRepo()
    const base = setupBranchScenario(tmpDir)

    const result = run(["run", "--dry-run", "--branch", base], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("branch")
    // Should detect files changed on the branch
    expect(result.stdout).toContain("src/auth.ts")
    expect(result.stdout).toContain("src/utils.ts")
  })

  test("dry-run with --branch and --agents filter", () => {
    tmpDir = createTempGitRepo()
    const base = setupBranchScenario(tmpDir)

    const result = run(
      ["run", "--dry-run", "--branch", base, "--agents", "security"],
      tmpDir
    )

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("agents:   1")
    expect(result.stdout).toContain("security")
  })

  test("branch mode with JSON format on empty branch diff", () => {
    tmpDir = createTempGitRepo()
    const base = getDefaultBranch(tmpDir)
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      agent: {
        security: { description: "Scanner", prompt: "Reviewer. Return `[]`." },
      },
      disabled_agents: ["bugs", "performance", "style"],
      review: { verify: false },
    })
    spawnSync("git", ["add", "."], { cwd: tmpDir })
    spawnSync("git", ["commit", "-m", "config on base"], { cwd: tmpDir })
    spawnSync("git", ["checkout", "-b", "no-changes"], { cwd: tmpDir })

    const result = run(
      ["run", "--branch", base, "--format", "json"],
      tmpDir
    )

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout)
    expect(output.issues).toEqual([])
    expect(output.meta.mode).toBe("branch")
  })

  test("dry-run with --branch shows file count", () => {
    tmpDir = createTempGitRepo()
    const base = setupBranchScenario(tmpDir)

    const result = run(["run", "--dry-run", "--branch", base], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("changed")
  })

  test("--branch with nonexistent branch fails", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      agent: {
        security: { description: "Scanner", prompt: "Reviewer." },
      },
      disabled_agents: ["bugs", "performance", "style"],
    })

    const result = run(["run", "--branch", "nonexistent-branch"], tmpDir)

    expect(result.exitCode).not.toBe(0)
  })
})

describe("CI auto-detection with branch mode", () => {
  test("GitHub Actions env triggers branch mode with GITHUB_BASE_REF", () => {
    tmpDir = createTempGitRepo()
    const base = setupBranchScenario(tmpDir)

    const result = run(["run", "--dry-run"], tmpDir, {
      CI: "true",
      GITHUB_ACTIONS: "true",
      GITHUB_BASE_REF: base,
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("branch")
  })

  test("GitLab CI env triggers branch mode", () => {
    tmpDir = createTempGitRepo()
    const base = setupBranchScenario(tmpDir)

    const result = run(["run", "--dry-run"], tmpDir, {
      CI: "true",
      GITLAB_CI: "true",
      CI_MERGE_REQUEST_TARGET_BRANCH_NAME: base,
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("branch")
  })

  test("Buildkite env triggers branch mode", () => {
    tmpDir = createTempGitRepo()
    const base = setupBranchScenario(tmpDir)

    const result = run(["run", "--dry-run"], tmpDir, {
      CI: "true",
      BUILDKITE: "true",
      BUILDKITE_PULL_REQUEST_BASE_BRANCH: base,
    })

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("branch")
  })
})
