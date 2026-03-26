import { describe, test, expect } from "bun:test"
import { spawnSync } from "child_process"
import path from "path"

const CLI_PATH = path.resolve(__dirname, "../../src/index.ts")

describe("openlens docs", () => {
  test("docs --help shows options", () => {
    const result = spawnSync("bun", ["run", CLI_PATH, "docs", "--help"], {
      encoding: "utf-8",
      timeout: 10_000,
    })
    expect(result.status).toBe(0)
    expect(result.stdout).toContain("--port")
    expect(result.stdout).toContain("--open")
    expect(result.stdout).toContain("wiki")
  })
})
