import { describe, it, expect, beforeAll, afterAll } from "bun:test"
import { gatherStrategyContext } from "../../src/context/strategy"
import fs from "fs/promises"
import path from "path"
import os from "os"

const sampleDiff = `diff --git a/src/auth.ts b/src/auth.ts
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,3 +10,5 @@ function login(user: string) {
+  const token = createToken(user)
+  return token
 }
`

let tmpDir: string

beforeAll(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), "openlens-test-"))
  await fs.writeFile(path.join(tmpDir, "package.json"), '{"name":"test","dependencies":{}}')
  await fs.mkdir(path.join(tmpDir, "src"), { recursive: true })
  await fs.writeFile(path.join(tmpDir, "src", "auth.ts"), 'export function login(user: string) {\n  return createToken(user)\n}')
  await fs.writeFile(path.join(tmpDir, ".eslintrc.json"), '{"rules":{}}')
})

afterAll(async () => {
  await fs.rm(tmpDir, { recursive: true, force: true })
})

describe("gatherStrategyContext", () => {
  it("returns empty string for undefined strategy", async () => {
    const result = await gatherStrategyContext(undefined, sampleDiff, tmpDir)
    expect(result).toBe("")
  })

  it("security strategy looks for dependency manifests", async () => {
    const result = await gatherStrategyContext("security", sampleDiff, tmpDir)
    expect(result).toContain("package.json")
  })

  it("style strategy looks for linter configs", async () => {
    const result = await gatherStrategyContext("style", sampleDiff, tmpDir)
    expect(result).toContain(".eslintrc.json")
  })

  it("respects max files cap (10 files)", async () => {
    const result = await gatherStrategyContext("security", sampleDiff, tmpDir)
    const fileHeaders = (result.match(/^### /gm) || [])
    expect(fileHeaders.length).toBeLessThanOrEqual(10)
  })

  it("respects max lines cap (5000 lines)", async () => {
    const result = await gatherStrategyContext("security", sampleDiff, tmpDir)
    const lines = result.split("\n")
    expect(lines.length).toBeLessThanOrEqual(5000)
  })
})
