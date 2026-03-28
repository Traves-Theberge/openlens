import { describe, test, expect, afterEach } from "bun:test"
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

describe("suppression: config file patterns", () => {
  test("dry-run loads config with suppress.files", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      agent: {
        security: {
          description: "Security scanner",
          prompt: "You are a security reviewer. Return `[]`.",
        },
      },
      disabled_agents: ["bugs", "performance", "style"],
      suppress: {
        files: ["vendor/**", "dist/**", "*.generated.ts"],
        patterns: [],
      },
    })
    addStagedFile(tmpDir, "src/app.ts", "const x = 1\n")

    const result = run(["run", "--dry-run"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("dry run")
  })

  test("dry-run loads config with suppress.patterns", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      agent: {
        security: {
          description: "Security scanner",
          prompt: "You are a security reviewer. Return `[]`.",
        },
      },
      disabled_agents: ["bugs", "performance", "style"],
      suppress: {
        files: [],
        patterns: ["TODO", "console.log"],
      },
    })
    addStagedFile(tmpDir, "src/app.ts", "console.log('hello')\n")

    const result = run(["run", "--dry-run"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("dry run")
  })

  test("JSON output on empty diff includes suppressed count in meta", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      agent: {
        security: {
          description: "Security scanner",
          prompt: "You are a security reviewer. Return `[]`.",
        },
      },
      disabled_agents: ["bugs", "performance", "style"],
      suppress: {
        files: ["test/**"],
        patterns: ["low-priority"],
      },
    })

    const result = run(["run", "--staged", "--format", "json"], tmpDir)

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout)
    expect(output.meta).toHaveProperty("suppressed")
    expect(typeof output.meta.suppressed).toBe("number")
  })
})

describe("suppression: .openlensignore file", () => {
  test("doctor works with .openlensignore file present", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      agent: {
        security: { description: "Scanner", prompt: "Reviewer." },
      },
      disabled_agents: ["bugs", "performance", "style"],
    })

    fs.writeFileSync(
      path.join(tmpDir, ".openlensignore"),
      `# Ignore generated files
generated/**
dist/**
*.min.js
node_modules/**
`
    )

    const result = run(["doctor"], tmpDir)

    expect(result.exitCode).not.toBeUndefined()
    expect(result.stdout).toContain("Doctor")
  })

  test(".openlensignore with comments and blank lines loads without error", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      agent: {
        security: { description: "Scanner", prompt: "Reviewer." },
      },
      disabled_agents: ["bugs", "performance", "style"],
    })

    fs.writeFileSync(
      path.join(tmpDir, ".openlensignore"),
      `# This is a comment
vendor/**

# Another comment
build/**

test/fixtures/**
`
    )
    addStagedFile(tmpDir, "src/app.ts", "const x = 1\n")

    const result = run(["run", "--dry-run"], tmpDir)

    expect(result.exitCode).toBe(0)
    expect(result.stdout).toContain("dry run")
  })

  test("review works with both config suppress and .openlensignore", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      agent: {
        security: { description: "Scanner", prompt: "Reviewer. Return `[]`." },
      },
      disabled_agents: ["bugs", "performance", "style"],
      suppress: {
        files: ["vendor/**"],
        patterns: ["false-positive"],
      },
    })

    fs.writeFileSync(
      path.join(tmpDir, ".openlensignore"),
      "dist/**\ngenerated/**\n"
    )

    const result = run(["run", "--staged", "--format", "json"], tmpDir)

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout)
    expect(Array.isArray(output.issues)).toBe(true)
  })
})

describe("suppression: empty/missing", () => {
  test("works without any suppression config", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      agent: {
        security: { description: "Scanner", prompt: "Reviewer. Return `[]`." },
      },
      disabled_agents: ["bugs", "performance", "style"],
    })

    const result = run(["run", "--staged", "--format", "json"], tmpDir)

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout)
    expect(output.meta.suppressed).toBe(0)
  })
})
