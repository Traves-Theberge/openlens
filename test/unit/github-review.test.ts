import { describe, it, expect } from "bun:test"
import { formatGitHubReview } from "../../src/output/github-review"

describe("formatGitHubReview", () => {
  const result = {
    issues: [
      { file: "src/app.ts", line: 10, severity: "critical" as const, agent: "security", title: "SQL injection", message: "Unsanitized input", confidence: "high" as const },
      { file: "src/utils.ts", line: 5, severity: "info" as const, agent: "style", title: "Unused import", message: "Remove it", confidence: "medium" as const },
    ],
    timing: { security: 5000, style: 3000 },
    meta: { mode: "staged", filesChanged: 2, agentsRun: 2, agentsFailed: 0, suppressed: 0, verified: true },
  }

  it("produces review comments per issue", () => {
    const review = formatGitHubReview(result)
    expect(review.comments).toHaveLength(2)
    expect(review.comments[0].path).toBe("src/app.ts")
    expect(review.comments[0].line).toBe(10)
    expect(review.comments[0].body).toContain("SQL injection")
  })

  it("sets REQUEST_CHANGES for critical issues", () => {
    const review = formatGitHubReview(result)
    expect(review.event).toBe("REQUEST_CHANGES")
  })

  it("sets COMMENT for warnings only", () => {
    const warningsOnly = { ...result, issues: [result.issues[1]] }
    const review = formatGitHubReview(warningsOnly)
    expect(review.event).toBe("COMMENT")
  })

  it("sets APPROVE for no issues", () => {
    const clean = { ...result, issues: [] }
    const review = formatGitHubReview(clean)
    expect(review.event).toBe("APPROVE")
  })

  it("generates issue fingerprints without line numbers", () => {
    const review = formatGitHubReview(result)
    expect(review.fingerprints).toBeDefined()
    expect(Object.keys(review.fingerprints)).toHaveLength(2)
    const modifiedResult = { ...result, issues: [{ ...result.issues[0], line: 99 }] }
    const review2 = formatGitHubReview(modifiedResult)
    const key1 = Object.keys(review.fingerprints)[0]
    const key2 = Object.keys(review2.fingerprints)[0]
    expect(key1).toBe(key2)
  })
})
