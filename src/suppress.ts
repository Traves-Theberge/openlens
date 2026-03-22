import type { Config } from "./config/schema.js"
import type { Issue } from "./types.js"
import fs from "fs/promises"
import path from "path"

export interface SuppressRule {
  type: "file" | "pattern" | "inline"
  value: string
}

export async function loadSuppressRules(
  config: Config,
  cwd: string
): Promise<SuppressRule[]> {
  const rules: SuppressRule[] = []

  // From config
  for (const file of config.suppress.files) {
    rules.push({ type: "file", value: file })
  }
  for (const pattern of config.suppress.patterns) {
    rules.push({ type: "pattern", value: pattern })
  }

  // From .openlensignore
  const ignorePath = path.join(cwd, ".openlensignore")
  try {
    const content = await fs.readFile(ignorePath, "utf-8")
    for (const line of content.split("\n")) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith("#")) continue
      rules.push({ type: "file", value: trimmed })
    }
  } catch {
    // No ignore file — fine
  }

  return rules
}

function matchGlob(pattern: string, value: string): boolean {
  // Simple glob: * matches anything, ** matches path segments
  const regex = pattern
    .replace(/\*\*/g, "§DOUBLESTAR§")
    .replace(/\*/g, "[^/]*")
    .replace(/§DOUBLESTAR§/g, ".*")
    .replace(/\?/g, ".")
  return new RegExp(`^${regex}$`).test(value)
}

export function shouldSuppress(
  issue: Issue,
  rules: SuppressRule[]
): boolean {
  for (const rule of rules) {
    switch (rule.type) {
      case "file":
        if (matchGlob(rule.value, issue.file)) return true
        break
      case "pattern":
        if (
          issue.title.toLowerCase().includes(rule.value.toLowerCase()) ||
          issue.message.toLowerCase().includes(rule.value.toLowerCase())
        ) {
          return true
        }
        break
    }
  }
  return false
}
