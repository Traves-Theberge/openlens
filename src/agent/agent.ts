import matter from "gray-matter"
import path from "path"
import fs from "fs/promises"
import type { Config } from "../config/schema.js"

export interface Agent {
  name: string
  description?: string
  model: string
  prompt: string
}

const BUILTIN_PROMPTS_DIR = path.join(import.meta.dir, "../../agents")

async function resolvePrompt(
  raw: string | undefined,
  agentName: string,
  cwd: string
): Promise<{ prompt: string; frontmatter: Record<string, any> }> {
  // Try {file:path} reference
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

    // Inline prompt
    if (!raw.startsWith("{")) {
      return { prompt: raw, frontmatter: {} }
    }
  }

  // Try builtin prompt
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

    agents.push({
      name,
      description:
        agentConfig.description || frontmatter.description || undefined,
      model:
        agentConfig.model ||
        frontmatter.model ||
        config.model,
      prompt,
    })
  }

  return agents
}
