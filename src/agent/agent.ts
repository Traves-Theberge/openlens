import matter from "gray-matter"
import path from "path"
import fs from "fs/promises"
import type { Config, AgentConfig } from "../config/schema.js"

export interface Agent {
  name: string
  description?: string
  model: string
  prompt: string
  system?: string
  tools?: Record<string, boolean>
  permission?: Record<string, "allow" | "deny" | "ask">
  temperature?: number
  maxTurns?: number
}

const BUILTIN_PROMPTS_DIR = path.join(import.meta.dir, "../../agents")

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

// Default tools that review agents can use — read-only access to explore the codebase
const DEFAULT_TOOLS: Record<string, boolean> = {
  read: true,
  grep: true,
  glob: true,
  list: true,
  fetch: false,
  edit: false,
  write: false,
  bash: false,
  patch: false,
}

export async function loadAgents(
  config: Config,
  cwd: string = process.cwd()
): Promise<Agent[]> {
  const agents: Agent[] = []

  for (const [name, agentConfig] of Object.entries(config.agent)) {
    if (config.disabled_agents.includes(name)) continue
    if (!agentConfig.enabled) continue

    const { prompt, frontmatter } = await resolvePrompt(
      agentConfig.prompt,
      name,
      cwd
    )

    // Merge tools: defaults < frontmatter < config
    const tools = {
      ...DEFAULT_TOOLS,
      ...(frontmatter.tools || {}),
      ...(agentConfig.tools || {}),
    }

    agents.push({
      name,
      description:
        agentConfig.description || frontmatter.description || undefined,
      model: agentConfig.model || frontmatter.model || config.model,
      prompt,
      system: agentConfig.system || frontmatter.system,
      tools,
      permission: agentConfig.permission || frontmatter.permission,
      temperature: agentConfig.temperature ?? frontmatter.temperature,
      maxTurns: agentConfig.maxTurns ?? frontmatter.maxTurns ?? 5,
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
      filtered.agent[name] = { ...filtered.agent[name], enabled: false }
    }
  }
  return filtered
}
