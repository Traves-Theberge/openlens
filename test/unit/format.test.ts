import { describe, test, expect } from "bun:test"
import { formatJson, formatSarif } from "../../src/output/format.js"
import type { ReviewResult } from "../../src/types.js"

const EMPTY_RESULT: ReviewResult = {
  issues: [],
  timing: {},
  meta: {
    mode: "staged",
    filesChanged: 0,
    agentsRun: 2,
    agentsFailed: 0,
    suppressed: 0,
    verified: false,
  },
}

const RESULT_WITH_ISSUES: ReviewResult = {
  issues: [
    {
      file: "src/auth.ts",
      line: 42,
      endLine: 45,
      severity: "critical",
      agent: "security",
      title: "SQL injection",
      message: "Unsanitized input in query",
      fix: "Use parameterized query",
      patch: "-db.query(`SELECT * FROM users WHERE name = '${name}'`)\n+db.query('SELECT * FROM users WHERE name = $1', [name])",
    },
    {
      file: "src/utils.ts",
      line: 10,
      severity: "warning",
      agent: "bugs",
      title: "Missing null check",
      message: "Response can be null",
    },
  ],
  timing: { security: 4200, bugs: 3100 },
  meta: {
    mode: "staged",
    filesChanged: 2,
    agentsRun: 2,
    agentsFailed: 0,
    suppressed: 1,
    verified: true,
  },
}

describe("formatJson", () => {
  test("outputs valid JSON", () => {
    const output = formatJson(RESULT_WITH_ISSUES)
    const parsed = JSON.parse(output)
    expect(parsed.issues).toHaveLength(2)
    expect(parsed.timing.security).toBe(4200)
  })

  test("handles empty result", () => {
    const output = formatJson(EMPTY_RESULT)
    const parsed = JSON.parse(output)
    expect(parsed.issues).toEqual([])
  })
})

describe("formatSarif", () => {
  test("produces valid SARIF 2.1.0", () => {
    const output = formatSarif(RESULT_WITH_ISSUES)
    const sarif = JSON.parse(output)

    expect(sarif.version).toBe("2.1.0")
    expect(sarif.runs).toHaveLength(1)

    const run = sarif.runs[0]
    expect(run.tool.driver.name).toBe("openreview")
  })

  test("maps severity to SARIF levels", () => {
    const sarif = JSON.parse(formatSarif(RESULT_WITH_ISSUES))
    const results = sarif.runs[0].results

    expect(results[0].level).toBe("error") // critical → error
    expect(results[1].level).toBe("warning") // warning → warning
  })

  test("includes file locations", () => {
    const sarif = JSON.parse(formatSarif(RESULT_WITH_ISSUES))
    const loc = sarif.runs[0].results[0].locations[0].physicalLocation

    expect(loc.artifactLocation.uri).toBe("src/auth.ts")
    expect(loc.region.startLine).toBe(42)
    expect(loc.region.endLine).toBe(45)
  })

  test("includes fixes when patch is present", () => {
    const sarif = JSON.parse(formatSarif(RESULT_WITH_ISSUES))
    const results = sarif.runs[0].results

    expect(results[0].fixes).toBeDefined()
    expect(results[0].fixes).toHaveLength(1)
    expect(results[1].fixes).toBeUndefined()
  })

  test("creates rules from unique agents", () => {
    const sarif = JSON.parse(formatSarif(RESULT_WITH_ISSUES))
    const rules = sarif.runs[0].tool.driver.rules

    expect(rules).toHaveLength(2)
    expect(rules.map((r: any) => r.id)).toContain("openreview/security")
    expect(rules.map((r: any) => r.id)).toContain("openreview/bugs")
  })

  test("handles empty results", () => {
    const sarif = JSON.parse(formatSarif(EMPTY_RESULT))
    expect(sarif.runs[0].results).toEqual([])
  })
})
