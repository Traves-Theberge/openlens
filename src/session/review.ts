import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk"
import type { Config } from "../config/schema.js"
import type { Issue, ReviewResult } from "../types.js"
import { IssueArraySchema } from "../types.js"
import { loadAgents, type Agent } from "../agent/agent.js"
import { getDiff, getAutoDetectedDiff } from "../tool/diff.js"
import { loadInstructions } from "../config/config.js"
import { bus } from "../bus/index.js"

function parseModel(model: string): { providerID: string; modelID: string } {
  const slash = model.indexOf("/")
  if (slash === -1) {
    return { providerID: "anthropic", modelID: model }
  }
  return {
    providerID: model.slice(0, slash),
    modelID: model.slice(slash + 1),
  }
}

function buildPrompt(
  agentPrompt: string,
  instructions: string,
  diff: string
): string {
  const parts: string[] = []

  parts.push(agentPrompt.trim())

  if (instructions.trim()) {
    parts.push("## Project-specific instructions\n\n" + instructions)
  }

  parts.push("## Diff to review\n\n```diff\n" + diff + "\n```")

  return parts.join("\n\n---\n\n")
}

function extractJsonArray(text: string): any[] {
  // Try to find a JSON array in the response
  const patterns = [
    // Fenced code block
    /```(?:json)?\s*\n?([\s\S]*?)\n?\s*```/,
    // Raw array
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

async function waitForSessionIdle(
  client: OpencodeClient,
  sessionId: string,
  timeoutMs: number = 120_000
): Promise<void> {
  const start = Date.now()

  while (Date.now() - start < timeoutMs) {
    const status = await client.session.status()
    const data = await status.data
    // The status endpoint returns overall status
    // Poll until the session is idle
    await new Promise((resolve) => setTimeout(resolve, 1000))

    // Check session messages to see if there's a complete assistant response
    const messages = await client.session.messages({
      path: { id: sessionId },
    })
    const data2 = await messages.data
    if (data2 && Array.isArray(data2)) {
      const lastMsg = data2[data2.length - 1]
      if (lastMsg && lastMsg.role === "assistant") {
        return
      }
    }
  }

  throw new Error(`Session ${sessionId} timed out after ${timeoutMs}ms`)
}

async function getSessionResponse(
  client: OpencodeClient,
  sessionId: string
): Promise<string> {
  const messages = await client.session.messages({
    path: { id: sessionId },
  })
  const data = await messages.data

  if (!data || !Array.isArray(data)) return ""

  // Find the last assistant message
  for (let i = data.length - 1; i >= 0; i--) {
    const msg = data[i]
    if (msg.role === "assistant" && msg.parts) {
      const textParts = msg.parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text || p.content || "")
      return textParts.join("\n")
    }
  }

  return ""
}

async function runSingleAgent(
  client: OpencodeClient,
  agent: Agent,
  diff: string,
  instructions: string
): Promise<Issue[]> {
  // Create session
  const sessionRes = await client.session.create({
    body: { title: `openreview-${agent.name}` },
  })
  const session = await sessionRes.data
  if (!session || !session.id) {
    throw new Error(`Failed to create session for agent ${agent.name}`)
  }

  const fullPrompt = buildPrompt(agent.prompt, instructions, diff)
  const model = parseModel(agent.model)

  // Send prompt
  await client.session.prompt({
    path: { id: session.id },
    body: {
      parts: [{ type: "text" as const, text: fullPrompt }],
      model,
    },
  })

  // Wait for completion
  await waitForSessionIdle(client, session.id)

  // Get response
  const responseText = await getSessionResponse(client, session.id)

  // Parse issues from response
  const rawIssues = extractJsonArray(responseText)
  const validated = IssueArraySchema.safeParse(rawIssues)

  if (validated.success) {
    return validated.data.map((issue) => ({
      ...issue,
      agent: agent.name,
    }))
  }

  // If validation fails, return raw parsed issues with agent tag
  return rawIssues.map((issue: any) => ({
    file: issue.file || "unknown",
    line: issue.line || 0,
    endLine: issue.endLine || issue.end_line,
    severity: issue.severity || "info",
    agent: agent.name,
    title: issue.title || "Untitled issue",
    message: issue.message || "",
    fix: issue.fix,
  }))
}

function dedup(issues: Issue[]): Issue[] {
  const seen = new Map<string, Issue>()

  for (const issue of issues) {
    const key = `${issue.file}:${issue.line}:${issue.title.toLowerCase().slice(0, 50)}`
    if (!seen.has(key)) {
      seen.set(key, issue)
    }
  }

  return Array.from(seen.values())
}

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

function bySeverity(a: Issue, b: Issue): number {
  return (SEVERITY_ORDER[a.severity] ?? 3) - (SEVERITY_ORDER[b.severity] ?? 3)
}

export async function runReview(
  config: Config,
  mode?: string,
  cwd: string = process.cwd()
): Promise<ReviewResult> {
  const resolvedMode = mode || config.review.defaultMode

  // Get diff
  let diff: string
  if (resolvedMode === "auto") {
    const result = await getAutoDetectedDiff(config.review.baseBranch)
    diff = result.diff
  } else {
    diff = await getDiff(
      resolvedMode as "staged" | "unstaged" | "branch",
      config.review.baseBranch
    )
  }

  if (!diff.trim()) {
    return { issues: [], timing: {} }
  }

  // Load instructions
  const instructions = await loadInstructions(
    config.review.instructions,
    cwd
  )

  // Load agents
  const agents = await loadAgents(config, cwd)

  if (agents.length === 0) {
    return { issues: [], timing: {} }
  }

  // Create client
  const client = createOpencodeClient({
    baseUrl: `http://${config.server.hostname}:${config.server.port}`,
  })

  bus.publish("review.started", {
    agents: agents.map((a) => a.name),
  })

  // Fan out: all agents in parallel
  const results = await Promise.allSettled(
    agents.map(async (agent) => {
      bus.publish("agent.started", { name: agent.name })
      const start = performance.now()

      try {
        const issues = await runSingleAgent(
          client,
          agent,
          diff,
          instructions
        )
        const time = performance.now() - start

        bus.publish("agent.completed", {
          name: agent.name,
          issueCount: issues.length,
          time,
        })

        return { name: agent.name, issues, time }
      } catch (error) {
        const errMsg =
          error instanceof Error ? error.message : String(error)
        bus.publish("agent.failed", {
          name: agent.name,
          error: errMsg,
        })
        throw error
      }
    })
  )

  // Collect results
  const allIssues: Issue[] = []
  const timing: Record<string, number> = {}

  for (const result of results) {
    if (result.status === "fulfilled") {
      allIssues.push(...result.value.issues)
      timing[result.value.name] = Math.round(result.value.time)
    }
  }

  const dedupedIssues = dedup(allIssues).sort(bySeverity)
  const totalTime = Object.values(timing).reduce(
    (sum, t) => Math.max(sum, t),
    0
  )

  bus.publish("review.completed", {
    issueCount: dedupedIssues.length,
    time: totalTime,
  })

  return {
    issues: dedupedIssues,
    timing,
  }
}
