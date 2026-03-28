import { describe, test, expect, afterEach } from "bun:test"
import { spawnSync } from "child_process"
import fs from "fs"
import path from "path"
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

describe("hook content validation", () => {
  test("pre-commit hook contains OPENLENS_SKIP check", () => {
    tmpDir = createTempGitRepo()
    run(["hooks", "install"], tmpDir)

    const hookContent = fs.readFileSync(
      path.join(tmpDir, ".git", "hooks", "pre-commit"),
      "utf-8"
    )

    expect(hookContent).toContain("OPENLENS_SKIP")
    expect(hookContent).toContain("openlens")
  })

  test("pre-push hook contains OPENLENS_SKIP check", () => {
    tmpDir = createTempGitRepo()
    run(["hooks", "install"], tmpDir)

    const hookContent = fs.readFileSync(
      path.join(tmpDir, ".git", "hooks", "pre-push"),
      "utf-8"
    )

    expect(hookContent).toContain("OPENLENS_SKIP")
    expect(hookContent).toContain("openlens")
  })

  test("pre-commit hook is executable", () => {
    tmpDir = createTempGitRepo()
    run(["hooks", "install"], tmpDir)

    const hookPath = path.join(tmpDir, ".git", "hooks", "pre-commit")
    const stat = fs.statSync(hookPath)
    // Check that the executable bit is set (at least user execute)
    expect(stat.mode & 0o100).toBeTruthy()
  })

  test("pre-push hook is executable", () => {
    tmpDir = createTempGitRepo()
    run(["hooks", "install"], tmpDir)

    const hookPath = path.join(tmpDir, ".git", "hooks", "pre-push")
    const stat = fs.statSync(hookPath)
    expect(stat.mode & 0o100).toBeTruthy()
  })

  test("pre-commit hook has shebang line", () => {
    tmpDir = createTempGitRepo()
    run(["hooks", "install"], tmpDir)

    const hookContent = fs.readFileSync(
      path.join(tmpDir, ".git", "hooks", "pre-commit"),
      "utf-8"
    )

    expect(hookContent.startsWith("#!/")).toBe(true)
  })
})

describe("OPENLENS_SKIP environment variable", () => {
  test("hooks install output mentions OPENLENS_SKIP", () => {
    tmpDir = createTempGitRepo()
    const result = run(["hooks", "install"], tmpDir)

    expect(result.exitCode).toBe(0)
    // The install should mention how to skip
    expect(result.stdout.toLowerCase()).toMatch(/skip|openlens_skip/i)
  })
})

describe("hooks: reinstall after remove", () => {
  test("can reinstall hooks after removing them", () => {
    tmpDir = createTempGitRepo()

    // Install
    run(["hooks", "install"], tmpDir)
    expect(fs.existsSync(path.join(tmpDir, ".git", "hooks", "pre-commit"))).toBe(true)

    // Remove
    run(["hooks", "remove"], tmpDir)
    expect(fs.existsSync(path.join(tmpDir, ".git", "hooks", "pre-commit"))).toBe(false)

    // Reinstall
    const result = run(["hooks", "install"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(fs.existsSync(path.join(tmpDir, ".git", "hooks", "pre-commit"))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, ".git", "hooks", "pre-push"))).toBe(true)
  })
})

describe("hooks: backup management", () => {
  test("multiple installs don't create cascading backups", () => {
    tmpDir = createTempGitRepo()
    const hooksDir = path.join(tmpDir, ".git", "hooks")
    fs.mkdirSync(hooksDir, { recursive: true })

    // Create an existing pre-commit hook
    fs.writeFileSync(
      path.join(hooksDir, "pre-commit"),
      "#!/bin/bash\necho original",
      { mode: 0o755 }
    )

    // Install once (creates backup)
    run(["hooks", "install"], tmpDir)
    expect(fs.existsSync(path.join(hooksDir, "pre-commit.backup"))).toBe(true)

    // Install again (should not create pre-commit.backup.backup)
    run(["hooks", "install"], tmpDir)
    expect(fs.existsSync(path.join(hooksDir, "pre-commit.backup.backup"))).toBe(false)
  })
})

describe("hooks: with setup command", () => {
  test("setup --hooks --yes installs hooks identical to hooks install", () => {
    tmpDir = createTempGitRepo()

    // Use setup to install hooks
    const setupResult = run(["setup", "--hooks", "--yes"], tmpDir)
    expect(setupResult.exitCode).toBe(0)

    // Read the hook content
    const setupHook = fs.readFileSync(
      path.join(tmpDir, ".git", "hooks", "pre-commit"),
      "utf-8"
    )

    // Remove and reinstall with direct command
    run(["hooks", "remove"], tmpDir)
    run(["hooks", "install"], tmpDir)

    const directHook = fs.readFileSync(
      path.join(tmpDir, ".git", "hooks", "pre-commit"),
      "utf-8"
    )

    // Both should produce the same hook content
    expect(setupHook).toBe(directHook)
  })
})
