import { describe, test, expect } from "bun:test"
import { shouldSuppress, type SuppressRule } from "../../src/suppress.js"
import type { Issue } from "../../src/types.js"

function issue(overrides: Partial<Issue> = {}): Issue {
  return {
    file: "src/auth.ts",
    line: 42,
    severity: "warning",
    agent: "security",
    title: "Test issue",
    message: "Test message",
    ...overrides,
  }
}

describe("shouldSuppress", () => {
  test("matches exact file path", () => {
    const rules: SuppressRule[] = [{ type: "file", value: "src/auth.ts" }]
    expect(shouldSuppress(issue(), rules)).toBe(true)
  })

  test("does not match different file", () => {
    const rules: SuppressRule[] = [{ type: "file", value: "src/other.ts" }]
    expect(shouldSuppress(issue(), rules)).toBe(false)
  })

  test("matches glob with *", () => {
    const rules: SuppressRule[] = [{ type: "file", value: "src/*.ts" }]
    expect(shouldSuppress(issue(), rules)).toBe(true)
  })

  test("* does not match path separators", () => {
    const rules: SuppressRule[] = [{ type: "file", value: "*.ts" }]
    expect(shouldSuppress(issue({ file: "src/deep/file.ts" }), rules)).toBe(false)
  })

  test("matches glob with **", () => {
    const rules: SuppressRule[] = [{ type: "file", value: "src/**/*.ts" }]
    expect(shouldSuppress(issue({ file: "src/deep/nested/file.ts" }), rules)).toBe(true)
  })

  test("matches ** at start", () => {
    const rules: SuppressRule[] = [{ type: "file", value: "**/*.min.js" }]
    expect(shouldSuppress(issue({ file: "vendor/lib.min.js" }), rules)).toBe(true)
  })

  test("matches ? wildcard", () => {
    const rules: SuppressRule[] = [{ type: "file", value: "src/auth.t?" }]
    expect(shouldSuppress(issue(), rules)).toBe(true)
  })

  test("matches generated/** pattern", () => {
    const rules: SuppressRule[] = [{ type: "file", value: "generated/**" }]
    expect(shouldSuppress(issue({ file: "generated/types.ts" }), rules)).toBe(true)
    expect(shouldSuppress(issue({ file: "generated/deep/file.ts" }), rules)).toBe(true)
    expect(shouldSuppress(issue({ file: "src/auth.ts" }), rules)).toBe(false)
  })

  test("matches pattern in title (case-insensitive)", () => {
    const rules: SuppressRule[] = [{ type: "pattern", value: "TODO" }]
    expect(shouldSuppress(issue({ title: "Found a TODO comment" }), rules)).toBe(true)
    expect(shouldSuppress(issue({ title: "Found a todo comment" }), rules)).toBe(true)
  })

  test("matches pattern in message", () => {
    const rules: SuppressRule[] = [{ type: "pattern", value: "FIXME" }]
    expect(shouldSuppress(issue({ message: "This is a FIXME note" }), rules)).toBe(true)
  })

  test("pattern does not match unrelated text", () => {
    const rules: SuppressRule[] = [{ type: "pattern", value: "FIXME" }]
    expect(shouldSuppress(issue({ title: "SQL injection", message: "Bad query" }), rules)).toBe(false)
  })

  test("multiple rules — any match suppresses", () => {
    const rules: SuppressRule[] = [
      { type: "file", value: "vendor/**" },
      { type: "pattern", value: "deprecated" },
    ]
    expect(shouldSuppress(issue({ file: "vendor/lib.js" }), rules)).toBe(true)
    expect(shouldSuppress(issue({ title: "Using deprecated API" }), rules)).toBe(true)
    expect(shouldSuppress(issue(), rules)).toBe(false)
  })

  test("empty rules suppress nothing", () => {
    expect(shouldSuppress(issue(), [])).toBe(false)
  })
})
