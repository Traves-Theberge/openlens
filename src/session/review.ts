import { createOpencodeClient, type OpencodeClient } from "@opencode-ai/sdk"
import type { Config } from "../config/schema.js"
import type { Issue, ReviewResult } from "../types.js"
import { IssueArraySchema } from "../types.js"
import { loadAgents, type Agent } from "../agent/agent.js"
import { getDiff, getAutoDetectedDiff, getDiffStats } from "../tool/diff.js"
import { loadInstructions } from "../config/config.js"
import { loadSuppressRules, shouldSuppress } from "../suppress.js"
import { bus } from "../bus/index.js"
import fs from "fs/promises"
import path from "path"

function parseModel(model: string): { providerID: string; modelID: string } {
  const slash = model.indexOf("/")
  if (slash === -1) return { providerID: "anthropic", modelID: model }
  return {
    providerID: model.slice(0, slash),
    modelID: model.slice(slash + 1),
  }
}

// Read full contents of changed files for context
async function readChangedFiles(
  diff: string,
  cwd: string
): Promise<string> {
  const stats = getDiffStats(diff)
  const sections: string[] = []

  for (const file of stats.files) {
    const filePath = path.resolve(cwd, file)
    try {
      const content = await fs.readFile(filePath, "utf-8")
      // Truncate very large files to avoid blowing context windows
      const lines = content.split("\n")
      const truncated =
        lines.length > 500
          ? lines.slice(0, 500).join("\n") +
            `\n\n... (truncated, ${lines.length} total lines)`
          : content
      sections.push(
        `### ${file}\n\`\`\`\n${truncated}\n\`\`\``
      )
    } catch {
      // File might be deleted — skip
    }
  }

  if (sections.length === 0) return ""
  return "## Full source of changed files\n\n" + sections.join("\n\n")
}

function buildPrompt(
  agentPrompt: string,
  instructions: string,
  diff: string,
  fileContext: string
): string {
  const parts: string[] = []

  parts.push(agentPrompt.trim())

  if (instructions.trim()) {
    parts.push("## Project-specific instructions\n\n" + instructions)
  }

  if (fileContext.trim()) {
    parts.push(fileContext)
  }

  parts.push("## Diff to review\n\n```diff\n" + diff + "\n```")

  parts.push(
    "## Important\n\n" +
      "You have access to tools: `read` (read files), `grep` (search code), " +
      "`glob` (find files), `list` (list directories). " +
      "Use them to explore the codebase for context when needed — " +
      "check imports, read related files, understand call sites. " +
      "Do NOT just guess. Investigate.\n\n" +
      "When done, output your findings as a JSON array of issues. " +
      "If no issues, return `[]`."
  )

  return parts.join("\n\n---\n\n")
}

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

// Use SSE event streaming to wait for session completion instead of polling
async function waitForSession(
  client: OpencodeClient,
  sessionId: string,
  timeoutMs: number
): Promise<void> {
  const start = Date.now()
  // Use event streaming if available, fall back to polling with backoff
  let delay = 500
  const maxDelay = 5000

  while (Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, delay))
    delay = Math.min(delay * 1.5, maxDelay)

    try {
      const messages = await client.session.messages({
        path: { id: sessionId },
      })
      const data = await messages.data
      if (!data || !Array.isArray(data)) continue

      // Look for a completed assistant message (one that has text parts and no pending tool calls)
      const assistantMsgs = data.filter((m: any) => m.role === "assistant")
      if (assistantMsgs.length === 0) continue

      const lastAssistant = assistantMsgs[assistantMsgs.length - 1]
      if (!lastAssistant.parts) continue

      const hasText = lastAssistant.parts.some(
        (p: any) => p.type === "text" && (p.text || p.content)
      )
      const hasPendingTool = lastAssistant.parts.some(
        (p: any) => p.type === "tool_use" || p.type === "tool-use"
      )

      // Session is done when there's a text response and no pending tools,
      // OR when the last message in the full list is from the assistant (loop ended)
      if (hasText && !hasPendingTool) return
      if (data[data.length - 1]?.role === "assistant" && hasText) return
    } catch {
      // Network error — retry
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

  // Walk backwards to find the last assistant text
  for (let i = data.length - 1; i >= 0; i--) {
    const msg = data[i]
    if (msg.role === "assistant" && msg.parts) {
      const textParts = msg.parts
        .filter((p: any) => p.type === "text")
        .map((p: any) => p.text || p.content || "")
      if (textParts.length > 0) return textParts.join("\n")
    }
  }

  return ""
}

async function runSingleAgent(
  client: OpencodeClient,
  agent: Agent,
  diff: string,
  instructions: string,
  fileContext: string,
  timeoutMs: number
): Promise<Issue[]> {
  const sessionRes = await client.session.create({
    body: { title: `openreview-${agent.name}` },
  })
  const session = await sessionRes.data
  if (!session?.id) {
    throw new Error(`Failed to create session for agent ${agent.name}`)
  }

  const fullPrompt = buildPrompt(agent.prompt, instructions, diff, fileContext)
  const model = parseModel(agent.model)

  // Send prompt with full OpenCode agent capabilities
  await client.session.prompt({
    path: { id: session.id },
    body: {
      parts: [{ type: "text" as const, text: fullPrompt }],
      model,
      // Pass system prompt if agent defines one
      ...(agent.system ? { system: agent.system } : {}),
      // Enable tools so the agent can explore the codebase
      ...(agent.tools ? { tools: agent.tools } : {}),
    },
  })

  await waitForSession(client, session.id, timeoutMs)

  const responseText = await getSessionResponse(client, session.id)
  const rawIssues = extractJsonArray(responseText)
  const validated = IssueArraySchema.safeParse(rawIssues)

  const issues = validated.success
    ? validated.data
    : rawIssues.map((issue: any) => ({
        file: issue.file || "unknown",
        line: issue.line || 0,
        endLine: issue.endLine || issue.end_line,
        severity: issue.severity || "info",
        title: issue.title || "Untitled issue",
        message: issue.message || "",
        fix: issue.fix,
        patch: issue.patch,
      }))

  return issues.map((issue) => ({ ...issue, agent: agent.name }))
}

// Verification agent — reviews all found issues and filters false positives
async function verifyIssues(
  client: OpencodeClient,
  issues: Issue[],
  diff: string,
  fileContext: string,
  config: Config
): Promise<Issue[]> {
  if (issues.length === 0) return issues

  bus.publish("agent.started", { name: "verifier" })
  const start = performance.now()

  try {
    const sessionRes = await client.session.create({
      body: { title: "openreview-verifier" },
    })
    const session = await sessionRes.data
    if (!session?.id) return issues

    const prompt = `You are a code review verifier. Your job is to filter out false positives.

Below are issues found by automated review agents. For each issue, determine if it is:
- A REAL issue that should be reported
- A FALSE POSITIVE that should be removed

You have access to tools (read, grep, glob, list) to investigate the codebase.
Use them to verify each issue — check the actual code, read imports, understand context.

## Issues to verify

\`\`\`json
${JSON.stringify(issues, null, 2)}
\`\`\`

## Diff that was reviewed

\`\`\`diff
${diff}
\`\`\`

${fileContext}

## Output

Return ONLY a JSON array of issues that are REAL (not false positives).
Keep the exact same format. Remove any issue you determine is a false positive.
If all issues are real, return them all. If all are false positives, return \`[]\`.`

    const model = parseModel(config.model)

    await client.session.prompt({
      path: { id: session.id },
      body: {
        parts: [{ type: "text" as const, text: prompt }],
        model,
        tools: { read: true, grep: true, glob: true, list: true },
      },
    })

    await waitForSession(client, session.id, config.review.timeoutMs)
    const responseText = await getSessionResponse(client, session.id)
    const verified = extractJsonArray(responseText)
    const validated = IssueArraySchema.safeParse(verified)

    const time = performance.now() - start
    const verifiedIssues = validated.success
      ? validated.data.map((i) => ({ ...i, agent: i.agent || "verified" }))
      : issues

    bus.publish("agent.completed", {
      name: "verifier",
      issueCount: verifiedIssues.length,
      time,
    })

    return verifiedIssues as Issue[]
  } catch (error) {
    const errMsg = error instanceof Error ? error.message : String(error)
    bus.publish("agent.failed", { name: "verifier", error: errMsg })
    return issues // On failure, return unfiltered
  }
}

function dedup(issues: Issue[]): Issue[] {
  const seen = new Map<string, Issue>()
  for (const issue of issues) {
    // Normalize key: file + line range + title prefix
    const key = `${issue.file}:${issue.line}:${(issue.endLine || issue.line)}:${issue.title.toLowerCase().slice(0, 60)}`
    const existing = seen.get(key)
    // Keep higher severity
    if (!existing || severityRank(issue.severity) < severityRank(existing.severity)) {
      seen.set(key, issue)
    }
  }
  return Array.from(seen.values())
}

const SEVERITY_RANK: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
}

function severityRank(s: string): number {
  return SEVERITY_RANK[s] ?? 3
}

function bySeverity(a: Issue, b: Issue): number {
  return severityRank(a.severity) - severityRank(b.severity)
}

export async function runReview(
  config: Config,
  mode?: string,
  cwd: string = process.cwd()
): Promise<ReviewResult> {
  const resolvedMode = mode || config.review.defaultMode

  // Get diff
  let diff: string
  let detectedMode = resolvedMode
  if (resolvedMode === "auto") {
    const result = await getAutoDetectedDiff(config.review.baseBranch)
    diff = result.diff
    detectedMode = result.mode
  } else {
    diff = await getDiff(
      resolvedMode as "staged" | "unstaged" | "branch",
      config.review.baseBranch
    )
  }

  if (!diff.trim()) {
    return { issues: [], timing: {}, meta: { mode: detectedMode, filesChanged: 0, agentsRun: 0, agentsFailed: 0, suppressed: 0, verified: false } }
  }

  const stats = getDiffStats(diff)

  // Load full file context if enabled
  let fileContext = ""
  if (config.review.fullFileContext) {
    fileContext = await readChangedFiles(diff, cwd)
  }

  const instructions = await loadInstructions(config.review.instructions, cwd)
  const agents = await loadAgents(config, cwd)
  const suppressRules = await loadSuppressRules(config, cwd)

  if (agents.length === 0) {
    return { issues: [], timing: {}, meta: { mode: detectedMode, filesChanged: stats.filesChanged, agentsRun: 0, agentsFailed: 0, suppressed: 0, verified: false } }
  }

  const client = createOpencodeClient({
    baseUrl: `http://${config.server.hostname}:${config.server.port}`,
  })

  bus.publish("review.started", { agents: agents.map((a) => a.name) })

  // Fan out with concurrency limit
  const concurrency = config.review.maxConcurrency
  const results: Array<
    PromiseSettledResult<{ name: string; issues: Issue[]; time: number }>
  > = []

  for (let i = 0; i < agents.length; i += concurrency) {
    const batch = agents.slice(i, i + concurrency)
    const batchResults = await Promise.allSettled(
      batch.map(async (agent) => {
        bus.publish("agent.started", { name: agent.name })
        const start = performance.now()

        try {
          const issues = await runSingleAgent(
            client,
            agent,
            diff,
            instructions,
            fileContext,
            config.review.timeoutMs
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
          bus.publish("agent.failed", { name: agent.name, error: errMsg })
          throw error
        }
      })
    )
    results.push(...batchResults)
  }

  // Collect results
  const allIssues: Issue[] = []
  const timing: Record<string, number> = {}
  let agentsFailed = 0

  for (const result of results) {
    if (result.status === "fulfilled") {
      allIssues.push(...result.value.issues)
      timing[result.value.name] = Math.round(result.value.time)
    } else {
      agentsFailed++
    }
  }

  // Dedup
  let processedIssues = dedup(allIssues)

  // Apply suppression rules
  let suppressed = 0
  if (suppressRules.length > 0) {
    const before = processedIssues.length
    processedIssues = processedIssues.filter(
      (issue) => !shouldSuppress(issue, suppressRules)
    )
    suppressed = before - processedIssues.length
  }

  // Verification pass
  let verified = false
  if (config.review.verify && processedIssues.length > 0) {
    processedIssues = await verifyIssues(
      client,
      processedIssues,
      diff,
      fileContext,
      config
    )
    verified = true
  }

  processedIssues.sort(bySeverity)

  const totalTime = Object.values(timing).reduce(
    (max, t) => Math.max(max, t),
    0
  )

  bus.publish("review.completed", {
    issueCount: processedIssues.length,
    time: totalTime,
  })

  return {
    issues: processedIssues,
    timing,
    meta: {
      mode: detectedMode,
      filesChanged: stats.filesChanged,
      agentsRun: agents.length,
      agentsFailed,
      suppressed,
      verified,
    },
  }
}
