import { ConfigSchema, type Config, type AgentConfig } from "./schema.js"
import { detectCI, inferBaseBranch } from "../env.js"
import path from "path"
import os from "os"
import fs from "fs/promises"

// Partial agent config — Zod fills in defaults (mode, disable, hidden)
const DEFAULT_AGENTS: Record<string, Partial<AgentConfig>> = {
  security: {
    description: "Security vulnerability scanner",
    prompt: "{file:agents/security.md}",
  },
  bugs: {
    description: "Bug and logic error detector",
    prompt: "{file:agents/bugs.md}",
  },
  performance: {
    description: "Performance issue finder",
    prompt: "{file:agents/performance.md}",
  },
  style: {
    description: "Style and convention checker",
    prompt: "{file:agents/style.md}",
  },
}

function resolveEnvVars(value: string): string {
  return value.replace(/\{env:([^}]+)\}/g, (_, varName) => {
    return process.env[varName] || ""
  })
}

async function resolveFileRefs(value: string, cwd: string): Promise<string> {
  const match = value.match(/^\{file:(.+)\}$/)
  if (!match) return value

  const filePath = path.resolve(cwd, match[1])
  try {
    return await fs.readFile(filePath, "utf-8")
  } catch {
    return value
  }
}

function resolveStringValues(obj: any): any {
  if (typeof obj === "string") return resolveEnvVars(obj)
  if (Array.isArray(obj)) return obj.map(resolveStringValues)
  if (obj && typeof obj === "object") {
    const result: any = {}
    for (const [key, val] of Object.entries(obj)) {
      result[key] = resolveStringValues(val)
    }
    return result
  }
  return obj
}

function deepMerge(target: any, source: any): any {
  const result = { ...target }
  for (const key of Object.keys(source)) {
    if (
      source[key] &&
      typeof source[key] === "object" &&
      !Array.isArray(source[key]) &&
      target[key] &&
      typeof target[key] === "object" &&
      !Array.isArray(target[key])
    ) {
      result[key] = deepMerge(target[key], source[key])
    } else {
      result[key] = source[key]
    }
  }
  return result
}

async function readJsonc(filePath: string): Promise<any | null> {
  try {
    const raw = await fs.readFile(filePath, "utf-8")
    const stripped = raw.replace(
      /\/\/.*$|\/\*[\s\S]*?\*\//gm,
      ""
    )
    return JSON.parse(stripped)
  } catch {
    return null
  }
}

export async function loadConfig(cwd: string): Promise<Config> {
  let merged: any = {
    agent: DEFAULT_AGENTS,
  }

  // Layer 1: Global config
  const globalDir = path.join(os.homedir(), ".config", "openlens")
  const globalConfig = await readJsonc(path.join(globalDir, "openlens.json"))
  if (globalConfig) {
    merged = deepMerge(merged, globalConfig)
  }

  // Layer 2: Project config
  for (const name of ["openlens.json", "openlens.jsonc"]) {
    const projectConfig = await readJsonc(path.join(cwd, name))
    if (projectConfig) {
      merged = deepMerge(merged, projectConfig)
      break
    }
  }

  // Layer 3: Environment overrides
  if (process.env.OPENLENS_MODEL) {
    merged.model = process.env.OPENLENS_MODEL
  }
  if (process.env.OPENLENS_PORT) {
    merged.server = merged.server || {}
    merged.server.port = parseInt(process.env.OPENLENS_PORT, 10)
  }

  // Layer 4: CI environment defaults
  const ci = detectCI()
  if (ci.isCI) {
    merged.review = merged.review || {}
    // CI defaults: branch mode, no interactive verify prompt issues
    if (!merged.review.defaultMode && !process.env.OPENLENS_MODE) {
      merged.review.defaultMode = "branch"
    }
    // Auto-detect base branch from CI environment
    const inferredBase = inferBaseBranch()
    if (inferredBase && !process.env.OPENLENS_BASE_BRANCH) {
      merged.review.baseBranch = inferredBase
    }
  }

  // Resolve {env:VAR} substitutions
  merged = resolveStringValues(merged)

  // Validate with Zod
  return ConfigSchema.parse(merged)
}

export async function loadInstructions(
  files: string[],
  cwd: string = process.cwd()
): Promise<string> {
  const parts: string[] = []
  for (const file of files) {
    const filePath = path.resolve(cwd, file)
    try {
      const content = await fs.readFile(filePath, "utf-8")
      parts.push(`# From: ${file}\n\n${content}`)
    } catch {
      // File doesn't exist — skip silently
    }
  }
  return parts.join("\n\n---\n\n")
}
