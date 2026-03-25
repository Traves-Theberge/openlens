import { describe, it, expect } from "bun:test"
import { IssueSchema, IssueArraySchema } from "../../src/types"

describe("confidence field", () => {
  it("accepts high/medium/low confidence", () => {
    const base = {
      file: "src/app.ts",
      line: 10,
      severity: "warning" as const,
      agent: "bugs",
      title: "Test",
      message: "Test message",
    }
    expect(IssueSchema.parse({ ...base, confidence: "high" }).confidence).toBe("high")
    expect(IssueSchema.parse({ ...base, confidence: "medium" }).confidence).toBe("medium")
    expect(IssueSchema.parse({ ...base, confidence: "low" }).confidence).toBe("low")
  })

  it("defaults confidence to high when omitted", () => {
    const result = IssueSchema.parse({
      file: "src/app.ts",
      line: 10,
      severity: "warning",
      agent: "bugs",
      title: "Test",
      message: "Test message",
    })
    expect(result.confidence).toBe("high")
  })

  it("accepts confidence in IssueArraySchema", () => {
    const result = IssueArraySchema.parse([{
      file: "src/app.ts",
      line: 10,
      severity: "warning",
      title: "Test",
      message: "Test message",
      confidence: "low",
    }])
    expect(result[0].confidence).toBe("low")
  })
})
