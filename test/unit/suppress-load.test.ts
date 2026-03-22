import { describe, test, expect, beforeEach, afterEach } from "bun:test"
import { loadSuppressRules } from "../../src/suppress.js"
import { ConfigSchema } from "../../src/config/schema.js"
import fs from "fs/promises"
import path from "path"
import os from "os"

describe("loadSuppressRules", () => {
  let tmpDir: string

  beforeEach(async () => {
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openlens-test-"))
  })

  afterEach(async () => {
    await fs.rm(tmpDir, { recursive: true, force: true })
  })

  test("loads file rules from config", async () => {
    const config = ConfigSchema.parse({
      suppress: { files: ["vendor/**", "generated/**"] },
    })
    const rules = await loadSuppressRules(config, tmpDir)
    expect(rules).toEqual([
      { type: "file", value: "vendor/**" },
      { type: "file", value: "generated/**" },
    ])
  })

  test("loads pattern rules from config", async () => {
    const config = ConfigSchema.parse({
      suppress: { patterns: ["TODO", "FIXME"] },
    })
    const rules = await loadSuppressRules(config, tmpDir)
    expect(rules).toEqual([
      { type: "pattern", value: "TODO" },
      { type: "pattern", value: "FIXME" },
    ])
  })

  test("loads rules from .openlensignore file", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".openlensignore"),
      "vendor/**\n# comment\n\ngenerated/**\n"
    )
    const config = ConfigSchema.parse({})
    const rules = await loadSuppressRules(config, tmpDir)
    expect(rules).toEqual([
      { type: "file", value: "vendor/**" },
      { type: "file", value: "generated/**" },
    ])
  })

  test("skips comments and blank lines in .openlensignore", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".openlensignore"),
      "# This is a comment\n\n  \n  # Another comment\nreal-pattern/**\n"
    )
    const config = ConfigSchema.parse({})
    const rules = await loadSuppressRules(config, tmpDir)
    expect(rules).toHaveLength(1)
    expect(rules[0].value).toBe("real-pattern/**")
  })

  test("combines config rules with .openlensignore rules", async () => {
    await fs.writeFile(
      path.join(tmpDir, ".openlensignore"),
      "dist/**\n"
    )
    const config = ConfigSchema.parse({
      suppress: { files: ["vendor/**"], patterns: ["TODO"] },
    })
    const rules = await loadSuppressRules(config, tmpDir)
    expect(rules).toHaveLength(3)
    expect(rules[0]).toEqual({ type: "file", value: "vendor/**" })
    expect(rules[1]).toEqual({ type: "pattern", value: "TODO" })
    expect(rules[2]).toEqual({ type: "file", value: "dist/**" })
  })

  test("returns only config rules when .openlensignore missing", async () => {
    const config = ConfigSchema.parse({
      suppress: { files: ["vendor/**"] },
    })
    const rules = await loadSuppressRules(config, tmpDir)
    expect(rules).toEqual([{ type: "file", value: "vendor/**" }])
  })

  test("returns empty array when no config and no ignore file", async () => {
    const config = ConfigSchema.parse({})
    const rules = await loadSuppressRules(config, tmpDir)
    expect(rules).toEqual([])
  })

  test("handles empty .openlensignore file", async () => {
    await fs.writeFile(path.join(tmpDir, ".openlensignore"), "")
    const config = ConfigSchema.parse({})
    const rules = await loadSuppressRules(config, tmpDir)
    expect(rules).toEqual([])
  })
})
