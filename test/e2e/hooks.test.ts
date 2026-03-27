import { describe, test, expect, afterEach } from "bun:test"
import fs from "fs"
import path from "path"
import { run, createTempGitRepo, cleanup } from "./helpers"

let tmpDir: string

afterEach(() => {
  if (tmpDir) cleanup(tmpDir)
})

describe("openlens hooks", () => {
  test("hooks install creates pre-commit and pre-push", () => {
    tmpDir = createTempGitRepo()
    const result = run(["hooks", "install"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("pre-commit")
    expect(result.stdout).toContain("pre-push")

    // Verify files exist
    expect(fs.existsSync(path.join(tmpDir, ".git", "hooks", "pre-commit"))).toBe(true)
    expect(fs.existsSync(path.join(tmpDir, ".git", "hooks", "pre-push"))).toBe(true)

    // Verify they contain openlens marker
    const preCommit = fs.readFileSync(path.join(tmpDir, ".git", "hooks", "pre-commit"), "utf-8")
    expect(preCommit).toContain("openlens")

    const prePush = fs.readFileSync(path.join(tmpDir, ".git", "hooks", "pre-push"), "utf-8")
    expect(prePush).toContain("openlens")
  })

  test("hooks install is idempotent", () => {
    tmpDir = createTempGitRepo()
    run(["hooks", "install"], tmpDir)
    const result = run(["hooks", "install"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("exists")
  })

  test("hooks install backs up existing hooks", () => {
    tmpDir = createTempGitRepo()
    // Create an existing pre-commit hook
    const hooksDir = path.join(tmpDir, ".git", "hooks")
    fs.mkdirSync(hooksDir, { recursive: true })
    fs.writeFileSync(path.join(hooksDir, "pre-commit"), "#!/bin/bash\necho existing", { mode: 0o755 })

    const result = run(["hooks", "install"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("backed up")

    // Backup should exist
    expect(fs.existsSync(path.join(hooksDir, "pre-commit.backup"))).toBe(true)
  })

  test("hooks remove deletes hooks", () => {
    tmpDir = createTempGitRepo()
    run(["hooks", "install"], tmpDir)

    const result = run(["hooks", "remove"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("removed")

    // Verify files are gone
    expect(fs.existsSync(path.join(tmpDir, ".git", "hooks", "pre-commit"))).toBe(false)
    expect(fs.existsSync(path.join(tmpDir, ".git", "hooks", "pre-push"))).toBe(false)
  })

  test("hooks remove restores backups", () => {
    tmpDir = createTempGitRepo()
    const hooksDir = path.join(tmpDir, ".git", "hooks")
    fs.mkdirSync(hooksDir, { recursive: true })
    fs.writeFileSync(path.join(hooksDir, "pre-commit"), "#!/bin/bash\necho original", { mode: 0o755 })

    run(["hooks", "install"], tmpDir)
    run(["hooks", "remove"], tmpDir)

    // Original should be restored
    const content = fs.readFileSync(path.join(hooksDir, "pre-commit"), "utf-8")
    expect(content).toContain("original")
  })

  test("hooks remove is idempotent", () => {
    tmpDir = createTempGitRepo()
    const result = run(["hooks", "remove"], tmpDir)
    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("skipped")
  })

  test("hooks with no subcommand shows help", () => {
    tmpDir = createTempGitRepo()
    const result = run(["hooks"], tmpDir)
    expect(result.exitCode).toBe(1)
    expect(result.stderr).toContain("install")
    expect(result.stderr).toContain("remove")
  })

  test("hooks install outside git repo fails", () => {
    const os = require("os")
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openlens-nogit-"))
    const result = run(["hooks", "install"], dir)
    expect(result.exitCode).toBe(2)
    expect(result.stderr).toContain("Not a git repository")
    cleanup(dir)
  })
})
