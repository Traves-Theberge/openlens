import {
  createOpencodeClient,
  type OpencodeClient,
} from "@opencode-ai/sdk"
import type { Config } from "../config/schema.js"
import type { Issue, ReviewResult } from "../types.js"
import { IssueArraySchema } from "../types.js"
import { loadAgents, type Agent } from "../agent/agent.js"
import { getDiff, getAutoDetectedDiff, getDiffStats } from "../tool/diff.js"
import { loadInstructions } from "../config/config.js"
import { loadSuppressRules, shouldSuppress } from "../suppress.js"
import { bus } from "../bus/index.js"
import { resolveOpencodeBin, detectCI } from "../env.js"
import { spawn } from "child_process"
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
    // Guard against path traversal from malformed diff output
    if (!filePath.startsWith(cwd + path.sep) && filePath !== cwd) continue
    try {
      const content = await fs.readFile(filePath, "utf-8")
      const lines = content.split("\n")
      const truncated =
        lines.length > 500
          ? lines.slice(0, 500).join("\n") +
            `\n\n... (truncated, ${lines.length} total lines)`
          : content
      sections.push(`### ${file}\n\`\`\`\n${truncated}\n\`\`\``)
    } catch {
      // File might be deleted — skip
    }
  }

  if (sections.length === 0) return ""
  return "## Full source of changed files\n\n" + sections.join("\n\n")
}

// Build user message content — system prompt is sent separately
function buildUserMessage(
  instructions: string,
  diff: string,
  fileContext: string,
  availableTools: string[],
  availableSubagents?: Agent[]
): string {
  const parts: string[] = []

  if (instructions.trim()) {
    parts.push("## Project-specific instructions\n\n" + instructions)
  }

  if (fileContext.trim()) {
    parts.push(fileContext)
  }

  parts.push("## Diff to review\n\n```diff\n" + diff + "\n```")

  const toolList = availableTools.length > 0
    ? availableTools.map((t) => `\`${t}\``).join(", ")
    : "none"

  let toolInstructions =
    `You have access to tools: ${toolList}. ` +
    "Use them to explore the codebase for context when needed — " +
    "check imports, read related files, understand call sites. " +
    "Do NOT just guess. Investigate."

  // If this is a primary agent, tell it about delegation capabilities
  if (availableSubagents && availableSubagents.length > 0) {
    const agentList = availableSubagents
      .map((a) => `- \`${a.name}\`: ${a.description || a.name}`)
      .join("\n")

    toolInstructions +=
      "\n\nYou are a primary orchestrator agent. You can delegate focused review tasks to specialist agents using the `openlens-delegate` tool.\n\n" +
      "## Available specialist agents\n\n" +
      agentList +
      "\n\nDecide which specialists are relevant based on the diff, delegate to them with specific questions, then synthesize their findings with your own analysis."
  }

  parts.push(
    "## Important\n\n" +
      toolInstructions +
      "\n\nWhen done, output your findings as a JSON array of issues. " +
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

// Convert agent permission map to OpenCode tools map { toolName: boolean }
function permissionToTools(permission: Record<string, any>): Record<string, boolean> {
  const tools: Record<string, boolean> = {}
  for (const [name, value] of Object.entries(permission)) {
    if (typeof value === "string") {
      tools[name] = value === "allow"
    }
  }
  return tools
}

// Get list of allowed tool names from permission map
function getAllowedToolNames(permission: Record<string, any>): string[] {
  return Object.entries(permission)
    .filter(([_, v]) => v === "allow")
    .map(([k]) => k)
}

// Wait for session to become idle.
// Try SSE event streaming first (instant notification), fall back to status polling.
async function waitForSession(
  client: OpencodeClient,
  sessionId: string,
  timeoutMs: number
): Promise<void> {
  const start = Date.now()

  // Try SSE event streaming for instant notification
  try {
    const resolved = await Promise.race([
      waitViaSSE(client, sessionId),
      timeout(timeoutMs),
    ])
    if (resolved === "timeout") {
      try { await client.session.abort({ path: { id: sessionId } }) } catch {}
      throw new Error(`Session ${sessionId} timed out after ${timeoutMs}ms`)
    }
    return
  } catch (err: any) {
    // SSE not available or failed — fall back to status polling
    if (err.message?.includes("timed out")) throw err
  }

  // Fallback: poll session.status()
  let delay = 300
  const maxDelay = 3000

  while (Date.now() - start < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, delay))
    delay = Math.min(delay * 1.5, maxDelay)

    try {
      const statusRes = await client.session.status()
      const statuses = await statusRes.data
      if (!statuses) continue

      const sessionStatus = statuses[sessionId]
      if (!sessionStatus) continue

      if (sessionStatus.type === "idle") return
    } catch {
      // Network error — retry
    }
  }

  try { await client.session.abort({ path: { id: sessionId } }) } catch {}
  throw new Error(`Session ${sessionId} timed out after ${timeoutMs}ms`)
}

// SSE-based wait: subscribe to events and resolve when session becomes idle
async function waitViaSSE(
  client: OpencodeClient,
  sessionId: string
): Promise<void> {
  const stream = await client.event.subscribe()
  const reader = (stream as any)?.getReader?.() || (stream as any)?.[Symbol.asyncIterator]?.()

  if (!reader) throw new Error("SSE not available")

  try {
    // Handle both ReadableStream and AsyncIterator patterns
    if (typeof reader.read === "function") {
      // ReadableStream reader
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        const event = (value as any)?.payload || value
        if (
          event?.type === "session.idle" &&
          event?.properties?.sessionID === sessionId
        ) return
        if (
          event?.type === "session.status" &&
          event?.properties?.sessionID === sessionId &&
          event?.properties?.status?.type === "idle"
        ) return
      }
    } else {
      // AsyncIterator
      for await (const value of reader) {
        const event = (value as any)?.payload || value
        if (
          event?.type === "session.idle" &&
          event?.properties?.sessionID === sessionId
        ) return
        if (
          event?.type === "session.status" &&
          event?.properties?.sessionID === sessionId &&
          event?.properties?.status?.type === "idle"
        ) return
      }
    }
  } finally {
    try {
      if (typeof reader.cancel === "function") reader.cancel()
      else if (typeof reader.return === "function") reader.return()
    } catch {}
  }
}

function timeout(ms: number): Promise<"timeout"> {
  return new Promise((resolve) => setTimeout(() => resolve("timeout"), ms))
}

async function getSessionResponse(
  client: OpencodeClient,
  sessionId: string
): Promise<string> {
  const messages = await client.session.messages({
    path: { id: sessionId },
  })
  const data = (await messages.data) as any[]
  if (!data || !Array.isArray(data)) return ""

  // Walk backwards to find the last assistant text
  // SDK returns { info: Message, parts: Part[] }[] or { role, parts }[]
  for (let i = data.length - 1; i >= 0; i--) {
    const entry = data[i]
    const msg = entry.info || entry
    const parts = entry.parts || msg.parts

    if (msg.role === "assistant" && parts) {
      const textParts = parts
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
  timeoutMs: number,
  mcpToolIds?: Set<string>,
  availableSubagents?: Agent[]
): Promise<Issue[]> {
  const sessionRes = await client.session.create({
    body: { title: `openlens-${agent.name}` },
  })
  const session = await sessionRes.data
  if (!session?.id) {
    throw new Error(`Failed to create session for agent ${agent.name}`)
  }

  try {
    const tools = permissionToTools(agent.permission)

    // Enable MCP tools that the agent hasn't explicitly denied
    if (mcpToolIds) {
      for (const id of mcpToolIds) {
        if (!(id in tools)) {
          // MCP tools default to available unless agent denies them
          tools[id] = agent.permission[id] !== "deny"
        }
      }
    }

    // Primary agents get access to delegation tools
    if (agent.mode === "primary" && availableSubagents && availableSubagents.length > 0) {
      tools["openlens-delegate"] = true
      tools["openlens-agents"] = true
      tools["openlens-conventions"] = true
    }

    const allowedTools = Object.entries(tools)
      .filter(([_, v]) => v)
      .map(([k]) => k)
    const userMessage = buildUserMessage(instructions, diff, fileContext, allowedTools, availableSubagents)
    const model = parseModel(agent.model)

    // Use promptAsync to fire-and-forget, then poll status
    await client.session.promptAsync({
      path: { id: session.id },
      body: {
        // System prompt goes in the system field — not baked into user message
        system: agent.prompt,
        parts: [{ type: "text" as const, text: userMessage }],
        model,
        tools,
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
  } finally {
    // Clean up session — don't pollute the OpenCode session list
    try {
      await client.session.delete({ path: { id: session.id } })
    } catch {
      // Best effort cleanup
    }
  }
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

  const sessionRes = await client.session.create({
    body: { title: "openlens-verifier" },
  })
  const session = await sessionRes.data
  if (!session?.id) return issues

  try {
    const systemPrompt = `You are a code review verifier. Your job is to filter out false positives.

For each issue, determine if it is:
- A REAL issue that should be reported
- A FALSE POSITIVE that should be removed

You have access to tools to investigate the codebase.
Use them to verify each issue — check the actual code, read imports, understand context.

Return ONLY a JSON array of issues that are REAL (not false positives).
Keep the exact same format. Remove any issue you determine is a false positive.
If all issues are real, return them all. If all are false positives, return \`[]\`.`

    const userMessage = `## Issues to verify

\`\`\`json
${JSON.stringify(issues, null, 2)}
\`\`\`

## Diff that was reviewed

\`\`\`diff
${diff}
\`\`\`

${fileContext}`

    const model = parseModel(config.model)

    await client.session.promptAsync({
      path: { id: session.id },
      body: {
        system: systemPrompt,
        parts: [{ type: "text" as const, text: userMessage }],
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
  } finally {
    try {
      await client.session.delete({ path: { id: session.id } })
    } catch {
      // Best effort cleanup
    }
  }
}

function dedup(issues: Issue[]): Issue[] {
  const seen = new Map<string, Issue>()
  for (const issue of issues) {
    const key = `${issue.file}:${issue.line}:${issue.endLine || issue.line}:${issue.title.toLowerCase().slice(0, 60)}`
    const existing = seen.get(key)
    if (
      !existing ||
      severityRank(issue.severity) < severityRank(existing.severity)
    ) {
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

// Connect MCP servers configured in openlens.json
async function connectMcpServers(
  client: OpencodeClient,
  config: Config
): Promise<void> {
  for (const [name, mcp] of Object.entries(config.mcp)) {
    if (!mcp.enabled) continue

    try {
      if (mcp.type === "local" && mcp.command) {
        await client.mcp.add({
          body: {
            name,
            config: {
              type: "local",
              command: [mcp.command, ...(mcp.args || [])],
              environment: mcp.environment,
            },
          },
        })
      } else if (mcp.type === "remote" && mcp.url) {
        await client.mcp.add({
          body: {
            name,
            config: {
              type: "remote",
              url: mcp.url,
            },
          },
        })
      }

      await client.mcp.connect({ path: { name } })
    } catch {
      // MCP server failed to connect — non-fatal, continue
    }
  }
}

// Start the bundled OpenCode server process
async function spawnOpencodeServer(
  config: Config,
  cwd?: string
): Promise<{ url: string; close: () => void }> {
  const bin = resolveOpencodeBin(cwd)
  const hostname = config.server.hostname
  const port = config.server.port
  const args = ["serve", `--hostname=${hostname}`, `--port=${port}`]

  const ci = detectCI()
  const serverTimeout = ci.isCI ? 15_000 : 5_000

  const proc = spawn(bin, args, {
    env: {
      ...process.env,
      OPENCODE_CONFIG_CONTENT: JSON.stringify({}),
    },
    stdio: ["ignore", "pipe", "pipe"],
  })

  const url = await new Promise<string>((resolve, reject) => {
    const id = setTimeout(() => {
      proc.kill()
      reject(
        new Error(
          `OpenCode server did not start within ${serverTimeout}ms. ` +
            `Binary: ${bin}. Is opencode-ai installed?`
        )
      )
    }, serverTimeout)

    let output = ""

    proc.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString()
      const lines = output.split("\n")
      for (const line of lines) {
        if (line.startsWith("opencode server listening")) {
          const match = line.match(/on\s+(https?:\/\/[^\s]+)/)
          if (match) {
            clearTimeout(id)
            resolve(match[1])
            return
          }
        }
      }
    })

    proc.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString()
    })

    proc.on("exit", (code) => {
      clearTimeout(id)
      let msg = `OpenCode server exited with code ${code}`
      if (output.trim()) msg += `\nOutput: ${output.slice(0, 500)}`
      reject(new Error(msg))
    })

    proc.on("error", (error) => {
      clearTimeout(id)
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        reject(
          new Error(
            `opencode binary not found at '${bin}'. ` +
              `Install it with: npm install opencode-ai`
          )
        )
      } else {
        reject(error)
      }
    })
  })

  return {
    url,
    close() {
      proc.kill()
    },
  }
}

// Try to connect to an existing OpenCode server, or start one
async function getClient(
  config: Config,
  cwd?: string
): Promise<{ client: OpencodeClient; cleanup?: () => void }> {
  const baseUrl = `http://${config.server.hostname}:${config.server.port}`

  // Try connecting to an existing server first
  const existingClient = createOpencodeClient({ baseUrl })
  try {
    const res = await existingClient.app.agents()
    if (res.data) {
      // Connect MCP servers to existing instance
      if (Object.keys(config.mcp).length > 0) {
        await connectMcpServers(existingClient, config)
      }
      return { client: existingClient }
    }
  } catch {
    // No server running — start one
  }

  // Start bundled server
  try {
    const server = await spawnOpencodeServer(config, cwd)
    const client = createOpencodeClient({ baseUrl: server.url })

    // Connect MCP servers to new instance
    if (Object.keys(config.mcp).length > 0) {
      await connectMcpServers(client, config)
    }

    return { client, cleanup: () => server.close() }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    throw new Error(`Failed to start OpenCode server: ${msg}`)
  }
}

// Run a single agent as a focused review — used by the delegation tool
export async function runSingleAgentReview(
  config: Config,
  agent: Agent,
  focus: { question: string; files?: string[] },
  cwd: string = process.cwd()
): Promise<ReviewResult> {
  const diff = await getDiff(
    (config.review.defaultMode === "auto" ? "staged" : config.review.defaultMode) as "staged" | "unstaged" | "branch",
    config.review.baseBranch
  )

  let fileContext = ""
  if (focus.files) {
    const sections: string[] = []
    for (const file of focus.files) {
      const filePath = path.resolve(cwd, file)
      if (!filePath.startsWith(cwd + path.sep) && filePath !== cwd) continue
      try {
        const content = await fs.readFile(filePath, "utf-8")
        const lines = content.split("\n")
        const truncated =
          lines.length > 500
            ? lines.slice(0, 500).join("\n") + `\n\n... (truncated, ${lines.length} total lines)`
            : content
        sections.push(`### ${file}\n\`\`\`\n${truncated}\n\`\`\``)
      } catch {
        // File might not exist
      }
    }
    if (sections.length > 0) {
      fileContext = "## Source files\n\n" + sections.join("\n\n")
    }
  } else if (config.review.fullFileContext) {
    fileContext = await readChangedFiles(diff, cwd)
  }

  const instructions = focus.question
  const { client, cleanup } = await getClient(config, cwd)

  try {
    const start = performance.now()
    const issues = await runSingleAgent(
      client,
      agent,
      diff,
      instructions,
      fileContext,
      config.review.timeoutMs
    )
    const time = performance.now() - start

    return {
      issues: issues.sort(bySeverity),
      timing: { [agent.name]: Math.round(time) },
      meta: {
        mode: config.review.defaultMode,
        filesChanged: getDiffStats(diff).filesChanged,
        agentsRun: 1,
        agentsFailed: 0,
        suppressed: 0,
        verified: false,
      },
    }
  } finally {
    if (cleanup) cleanup()
  }
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
    return {
      issues: [],
      timing: {},
      meta: {
        mode: detectedMode,
        filesChanged: 0,
        agentsRun: 0,
        agentsFailed: 0,
        suppressed: 0,
        verified: false,
      },
    }
  }

  const stats = getDiffStats(diff)

  // Load full file context if enabled globally
  let fileContext = ""
  if (config.review.fullFileContext) {
    fileContext = await readChangedFiles(diff, cwd)
  }

  const instructions = await loadInstructions(config.review.instructions, cwd)
  const allAgents = await loadAgents(config, cwd)
  const suppressRules = await loadSuppressRules(config, cwd)

  // Separate primary orchestrator agents from subagents
  const primaryAgents = allAgents.filter((a) => a.mode === "primary")
  const subagents = allAgents.filter(
    (a) => a.mode === "subagent" || a.mode === "all"
  )

  // If primary agents exist, they orchestrate; otherwise run subagents directly
  const agents = primaryAgents.length > 0 ? primaryAgents : subagents

  if (agents.length === 0) {
    return {
      issues: [],
      timing: {},
      meta: {
        mode: detectedMode,
        filesChanged: stats.filesChanged,
        agentsRun: 0,
        agentsFailed: 0,
        suppressed: 0,
        verified: false,
      },
    }
  }

  // Connect to OpenCode server or start one
  const { client, cleanup } = await getClient(config, cwd)

  try {
    // Discover available tools from the server
    let serverToolIds: Set<string> | null = null
    try {
      const toolRes = await client.tool.ids()
      const ids = await toolRes.data
      if (ids && Array.isArray(ids)) {
        serverToolIds = new Set(ids)
      }
    } catch {
      // Tool discovery not available — proceed with configured tools
    }

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
            // Per-agent file context: skip if agent has fullFileContext: false
            const agentFileContext =
              agent.fullFileContext === false ? "" : fileContext

            const issues = await runSingleAgent(
              client,
              agent,
              diff,
              instructions,
              agentFileContext,
              config.review.timeoutMs,
              serverToolIds || undefined,
              // Primary agents get the list of subagents for delegation
              agent.mode === "primary" ? subagents : undefined
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
  } finally {
    if (cleanup) cleanup()
  }
}
