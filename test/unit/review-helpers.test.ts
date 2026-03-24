import { describe, test, expect } from "bun:test"

// These functions are internal to review.ts, so we re-implement them here for testing.
// In a real project you'd export them or use a test helper.

// --- extractJsonArray ---
function extractJsonArray(text: string): any[] {
  const patterns = [
    /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/,
    /(\[[\s\S]*\])/,
  ]
  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      try {
        const parsed = JSON.parse(match[1])
        if (Array.isArray(parsed)) return parsed
      } catch {
        continue
      }
    }
  }
  return []
}

// --- permissionToTools ---
function permissionToTools(permission: Record<string, any>): Record<string, boolean> {
  const tools: Record<string, boolean> = {}
  for (const [name, value] of Object.entries(permission)) {
    if (typeof value === "string") {
      tools[name] = value === "allow"
    }
  }
  return tools
}

// --- getAllowedToolNames ---
function getAllowedToolNames(permission: Record<string, any>): string[] {
  return Object.entries(permission)
    .filter(([_, v]) => v === "allow")
    .map(([k]) => k)
}

// --- parseModel ---
function parseModel(model: string): { providerID: string; modelID: string } {
  const slash = model.indexOf("/")
  if (slash === -1) return { providerID: "opencode", modelID: model }
  return {
    providerID: model.slice(0, slash),
    modelID: model.slice(slash + 1),
  }
}

// --- dedup ---
function severityRank(s: string): number {
  const ranks: Record<string, number> = { critical: 0, warning: 1, info: 2 }
  return ranks[s] ?? 3
}

function dedup(issues: any[]): any[] {
  const seen = new Map<string, any>()
  for (const issue of issues) {
    const key = `${issue.file}:${issue.line}:${issue.endLine || issue.line}:${issue.title.toLowerCase().slice(0, 60)}`
    const existing = seen.get(key)
    if (!existing || severityRank(issue.severity) < severityRank(existing.severity)) {
      seen.set(key, issue)
    }
  }
  return Array.from(seen.values())
}

describe("extractJsonArray", () => {
  test("extracts from ```json code block", () => {
    const text = 'Here are the issues:\n```json\n[{"file":"a.ts","line":1}]\n```'
    expect(extractJsonArray(text)).toEqual([{ file: "a.ts", line: 1 }])
  })

  test("extracts from ``` code block without json tag", () => {
    const text = "```\n[{\"x\":1}]\n```"
    expect(extractJsonArray(text)).toEqual([{ x: 1 }])
  })

  test("extracts bare JSON array", () => {
    const text = 'No issues found: [{"a":1}]'
    expect(extractJsonArray(text)).toEqual([{ a: 1 }])
  })

  test("returns empty array for no JSON", () => {
    expect(extractJsonArray("No issues found.")).toEqual([])
  })

  test("returns empty array for invalid JSON", () => {
    expect(extractJsonArray("```json\n{not valid}\n```")).toEqual([])
  })

  test("returns empty array for JSON object (not array)", () => {
    const text = '```json\n{"key": "value"}\n```'
    expect(extractJsonArray(text)).toEqual([])
  })

  test("handles empty array", () => {
    expect(extractJsonArray("```json\n[]\n```")).toEqual([])
  })

  test("prefers code block over bare JSON", () => {
    const text = '```json\n[{"from":"block"}]\n```\n[{"from":"bare"}]'
    expect(extractJsonArray(text)).toEqual([{ from: "block" }])
  })
})

describe("permissionToTools", () => {
  test("converts allow to true", () => {
    expect(permissionToTools({ read: "allow" })).toEqual({ read: true })
  })

  test("converts deny to false", () => {
    expect(permissionToTools({ bash: "deny" })).toEqual({ bash: false })
  })

  test("converts ask to false", () => {
    expect(permissionToTools({ edit: "ask" })).toEqual({ edit: false })
  })

  test("skips non-string values (granular patterns)", () => {
    const perm = {
      read: "allow",
      bash: { "git *": "allow", "*": "deny" },
    }
    expect(permissionToTools(perm)).toEqual({ read: true })
  })

  test("handles mixed permissions", () => {
    const perm = {
      read: "allow",
      grep: "allow",
      glob: "allow",
      edit: "deny",
      bash: "deny",
      webfetch: "ask",
    }
    const result = permissionToTools(perm)
    expect(result.read).toBe(true)
    expect(result.grep).toBe(true)
    expect(result.edit).toBe(false)
    expect(result.bash).toBe(false)
    expect(result.webfetch).toBe(false)
  })
})

describe("getAllowedToolNames", () => {
  test("returns only allowed tool names", () => {
    const perm = { read: "allow", grep: "allow", bash: "deny", edit: "ask" }
    expect(getAllowedToolNames(perm)).toEqual(["read", "grep"])
  })

  test("returns empty array when nothing allowed", () => {
    expect(getAllowedToolNames({ bash: "deny", edit: "deny" })).toEqual([])
  })
})

describe("parseModel", () => {
  test("parses provider/model format", () => {
    expect(parseModel("anthropic/claude-sonnet-4-20250514")).toEqual({
      providerID: "anthropic",
      modelID: "claude-sonnet-4-20250514",
    })
  })

  test("parses openai model", () => {
    expect(parseModel("openai/gpt-4o")).toEqual({
      providerID: "openai",
      modelID: "gpt-4o",
    })
  })

  test("defaults to opencode when no slash", () => {
    expect(parseModel("mimo-v2-pro-free")).toEqual({
      providerID: "opencode",
      modelID: "mimo-v2-pro-free",
    })
  })

  test("handles model with multiple slashes", () => {
    expect(parseModel("lmstudio/google/gemma")).toEqual({
      providerID: "lmstudio",
      modelID: "google/gemma",
    })
  })
})

describe("dedup", () => {
  const base = {
    file: "src/auth.ts",
    line: 42,
    title: "SQL injection",
    message: "Bad query",
  }

  test("removes exact duplicates", () => {
    const issues = [
      { ...base, severity: "warning", agent: "security" },
      { ...base, severity: "warning", agent: "bugs" },
    ]
    expect(dedup(issues)).toHaveLength(1)
  })

  test("keeps higher severity when duplicated", () => {
    const issues = [
      { ...base, severity: "warning", agent: "bugs" },
      { ...base, severity: "critical", agent: "security" },
    ]
    const result = dedup(issues)
    expect(result).toHaveLength(1)
    expect(result[0].severity).toBe("critical")
  })

  test("keeps different issues on different lines", () => {
    const issues = [
      { ...base, line: 42, severity: "warning", agent: "a" },
      { ...base, line: 99, severity: "warning", agent: "a" },
    ]
    expect(dedup(issues)).toHaveLength(2)
  })

  test("keeps issues with different titles", () => {
    const issues = [
      { ...base, title: "SQL injection", severity: "warning", agent: "a" },
      { ...base, title: "XSS vulnerability", severity: "warning", agent: "a" },
    ]
    expect(dedup(issues)).toHaveLength(2)
  })

  test("handles empty array", () => {
    expect(dedup([])).toEqual([])
  })
})
