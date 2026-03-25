import matter from "gray-matter"
import path from "path"
import fs from "fs/promises"
import { fileURLToPath } from "url"
import type { Config, AgentConfig } from "../config/schema.js"

export interface Agent {
  name: string
  description?: string
  mode: "primary" | "subagent" | "all"
  model: string
  prompt: string
  temperature?: number
  top_p?: number
  steps: number
  color?: string
  // Per-agent override: include full file source in prompt (undefined = inherit global)
  fullFileContext?: boolean
  // Context strategy for auto-gathering relevant files
  context?: "security" | "bugs" | "performance" | "style"
  // Permission map: tool name → "allow" | "deny" | "ask" (or granular patterns)
  permission: Record<string, any>
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const BUILTIN_PROMPTS_DIR = path.join(__dirname, "../../agents")

async function resolvePrompt(
  raw: string | undefined,
  agentName: string,
  cwd: string
): Promise<{ prompt: string; frontmatter: Record<string, any> }> {
  if (raw) {
    const match = raw.match(/^\{file:(.+)\}$/)
    if (match) {
      const filePath = path.resolve(cwd, match[1])
      try {
        const content = await fs.readFile(filePath, "utf-8")
        const parsed = matter(content)
        return { prompt: parsed.content, frontmatter: parsed.data }
      } catch {
        // Fall through to builtin
      }
    }

    if (!raw.startsWith("{")) {
      return { prompt: raw, frontmatter: {} }
    }
  }

  const builtinPath = path.join(BUILTIN_PROMPTS_DIR, `${agentName}.md`)
  try {
    const content = await fs.readFile(builtinPath, "utf-8")
    const parsed = matter(content)
    return { prompt: parsed.content, frontmatter: parsed.data }
  } catch {
    return {
      prompt: `You are a ${agentName} code reviewer. Review the provided diff and return issues as a JSON array.`,
      frontmatter: {},
    }
  }
}

// Default permissions for review agents — read-only codebase access
// Matches OpenCode's built-in tool set (https://github.com/anomalyco/opencode)
const DEFAULT_PERMISSIONS: Record<string, string> = {
  read: "allow",
  grep: "allow",
  glob: "allow",
  list: "allow",
  edit: "deny",
  write: "deny",
  patch: "deny",
  bash: "deny",
  lsp: "allow",
  skill: "allow",
  webfetch: "deny",
  websearch: "deny",
  task: "deny",
}

export async function loadAgents(
  config: Config,
  cwd: string = process.cwd()
): Promise<Agent[]> {
  const agents: Agent[] = []

  for (const [name, agentConfig] of Object.entries(config.agent)) {
    if (config.disabled_agents.includes(name)) continue
    if (agentConfig.disable) continue

    const { prompt, frontmatter } = await resolvePrompt(
      agentConfig.prompt,
      name,
      cwd
    )

    // Merge permissions: defaults < global config < frontmatter < agent config
    const permission = {
      ...DEFAULT_PERMISSIONS,
      ...(config.permission || {}),
      ...(frontmatter.permission || {}),
      ...(agentConfig.permission || {}),
    }

    agents.push({
      name,
      description:
        agentConfig.description || frontmatter.description || undefined,
      mode: agentConfig.mode || frontmatter.mode || "subagent",
      model: agentConfig.model || frontmatter.model || config.model,
      prompt,
      temperature: agentConfig.temperature ?? frontmatter.temperature,
      top_p: agentConfig.top_p ?? frontmatter.top_p,
      steps: agentConfig.steps ?? frontmatter.steps ?? 5,
      color: agentConfig.color || frontmatter.color,
      fullFileContext:
        agentConfig.fullFileContext ?? frontmatter.fullFileContext,
      context: agentConfig.context ?? frontmatter.context,
      permission,
    })
  }

  return agents
}

export function filterAgents(
  config: Config,
  requested: string | undefined
): Config {
  if (!requested) return config
  const names = new Set(requested.split(",").map((s) => s.trim()))
  const filtered = { ...config, agent: { ...config.agent } }
  for (const name of Object.keys(filtered.agent)) {
    if (!names.has(name)) {
      filtered.agent[name] = { ...filtered.agent[name], disable: true }
    }
  }
  return filtered
}

export function excludeAgents(
  config: Config,
  excluded: string
): Config {
  const names = new Set(excluded.split(",").map((s) => s.trim()))
  const filtered = { ...config, agent: { ...config.agent } }
  for (const name of names) {
    if (filtered.agent[name]) {
      filtered.agent[name] = { ...filtered.agent[name], disable: true }
    }
  }
  return filtered
}
