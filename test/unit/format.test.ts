import { describe, test, expect, it } from "bun:test"
import { formatText, formatJson, formatSarif, formatMarkdown } from "../../src/output/format.js"
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
    expect(run.tool.driver.name).toBe("openlens")
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
    expect(rules.map((r: any) => r.id)).toContain("openlens/security")
    expect(rules.map((r: any) => r.id)).toContain("openlens/bugs")
  })

  test("handles empty results", () => {
    const sarif = JSON.parse(formatSarif(EMPTY_RESULT))
    expect(sarif.runs[0].results).toEqual([])
  })
})

describe("formatMarkdown", () => {
  test("starts with marker comment", () => {
    const output = formatMarkdown(RESULT_WITH_ISSUES)
    expect(output.startsWith("<!-- openlens-review -->")).toBe(true)
  })

  test("shows no-issues message for empty result", () => {
    const output = formatMarkdown(EMPTY_RESULT)
    expect(output).toContain(":white_check_mark:")
    expect(output).toContain("No issues found")
  })

  test("includes severity summary table", () => {
    const output = formatMarkdown(RESULT_WITH_ISSUES)
    expect(output).toContain("| :red_circle: Critical | 1 |")
    expect(output).toContain("| :yellow_circle: Warning | 1 |")
  })

  test("generates GitHub permalinks when repo and sha provided", () => {
    const output = formatMarkdown(RESULT_WITH_ISSUES, {
      repo: "owner/repo",
      sha: "abc123",
    })
    expect(output).toContain(
      "[src/auth.ts:42](https://github.com/owner/repo/blob/abc123/src/auth.ts#L42-L45)"
    )
  })

  test("falls back to backtick file:line without repo/sha", () => {
    const output = formatMarkdown(RESULT_WITH_ISSUES)
    expect(output).toContain("`src/auth.ts:42`")
  })

  test("groups issues by file in collapsible sections", () => {
    const output = formatMarkdown(RESULT_WITH_ISSUES)
    expect(output).toContain("<details>")
    expect(output).toContain("<summary><b>src/auth.ts</b> (1 issue)</summary>")
    expect(output).toContain(
      "<summary><b>src/utils.ts</b> (1 issue)</summary>"
    )
    expect(output).toContain("</details>")
  })

  test("renders patch as diff code block", () => {
    const output = formatMarkdown(RESULT_WITH_ISSUES)
    expect(output).toContain("```diff")
    expect(output).toContain("-db.query(")
    expect(output).toContain("+db.query(")
  })

  test("renders fix as blockquote", () => {
    const output = formatMarkdown(RESULT_WITH_ISSUES)
    expect(output).toContain("> **Fix:** Use parameterized query")
  })

  test("includes timing in collapsed footer", () => {
    const output = formatMarkdown(RESULT_WITH_ISSUES)
    expect(output).toContain("<summary>Timing</summary>")
    expect(output).toContain("**security**: 4.2s")
    expect(output).toContain("**bugs**: 3.1s")
  })

  test("includes meta information", () => {
    const output = formatMarkdown(RESULT_WITH_ISSUES)
    expect(output).toContain("2 files changed")
    expect(output).toContain("verified")
    expect(output).toContain("1 suppressed")
  })
})

describe("confidence in output", () => {
  const issueWithConfidence = {
    file: "src/app.ts",
    line: 10,
    severity: "warning" as const,
    agent: "bugs",
    title: "Test issue",
    message: "Test message",
    confidence: "low" as const,
  }

  const result = {
    issues: [issueWithConfidence],
    timing: { bugs: 1000 },
    meta: { mode: "staged", filesChanged: 1, agentsRun: 1, agentsFailed: 0, suppressed: 0, verified: false },
  }

  it("formatText shows confidence", () => {
    const output = formatText(result)
    expect(output).toContain("low")
  })

  it("formatJson includes confidence field", () => {
    const output = JSON.parse(formatJson(result))
    expect(output.issues[0].confidence).toBe("low")
  })

  it("formatSarif maps confidence to properties", () => {
    const output = JSON.parse(formatSarif(result))
    const sarifResult = output.runs[0].results[0]
    expect(sarifResult.properties.confidence).toBe("low")
    expect(sarifResult.rank).toBe(10.0)
  })

  it("formatMarkdown shows confidence", () => {
    const output = formatMarkdown(result)
    expect(output).toContain("low")
  })
})
