import { z } from "zod"

export const McpServerSchema = z.object({
  type: z.enum(["local", "remote"]).default("local"),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().url("Invalid URL format — must start with http:// or https://").optional(),
  environment: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().default(true),
}).refine(
  (mcp) => mcp.type !== "remote" || (mcp.url && mcp.url.length > 0),
  { message: "Remote MCP servers require a valid url", path: ["url"] },
).refine(
  (mcp) => mcp.type !== "local" || !mcp.url || mcp.command,
  { message: "Local MCP servers require a command", path: ["command"] },
)

// Permission value: "allow" | "deny" | "ask" OR { pattern: value } for granular control
const PermissionValueSchema = z.union([
  z.enum(["allow", "deny", "ask"]),
  z.record(z.string(), z.enum(["allow", "deny", "ask"])),
])

// Agent config — mirrors opencode.json agent format exactly
export const AgentConfigSchema = z.object({
  description: z.string().optional(),
  mode: z.enum(["primary", "subagent", "all"]).default("subagent"),
  model: z.string().optional(),
  prompt: z.string().optional(),
  temperature: z.number().min(0).max(1).optional(),
  top_p: z.number().min(0).max(1).optional(),
  steps: z.number().int().min(1).optional().describe("Max agentic loop iterations"),
  disable: z.boolean().default(false),
  hidden: z.boolean().default(false),
  color: z.string().optional(),
  fullFileContext: z
    .boolean()
    .optional()
    .describe("Include full file context in prompt (default: inherit from review.fullFileContext)"),
  context: z.enum(["security", "bugs", "performance", "style"]).optional(),
  permission: z
    .record(z.string(), PermissionValueSchema)
    .optional()
    .describe('Tool permissions: { read: "allow", bash: "deny", edit: "ask" }'),
})

export const ConfigSchema = z.object({
  $schema: z.string().optional(),
  model: z.string().default("opencode/big-pickle"),
  agent: z.record(z.string(), AgentConfigSchema).default({}),
  // Global permissions (agents inherit these, can override)
  permission: z.record(z.string(), PermissionValueSchema).optional(),
  server: z
    .object({
      port: z.number().int().min(1).max(65535).default(4096),
      hostname: z.string().min(1, "Hostname must not be empty").default("localhost"),
    })
    .default({ port: 4096, hostname: "localhost" }),
  review: z
    .object({
      defaultMode: z
        .enum(["staged", "unstaged", "branch", "auto"])
        .default("staged"),
      instructions: z.array(z.string()).default(["REVIEW.md"]),
      baseBranch: z.string().default("main"),
      fullFileContext: z.boolean().default(true),
      verify: z.boolean().default(true),
      timeoutMs: z.number().default(180_000),
      maxConcurrency: z.number().int().min(1).default(4),
      minConfidence: z.enum(["high", "medium", "low"]).default("medium"),
      rules: z
        .object({
          enabled: z.boolean().default(true),
          extraFiles: z.array(z.string()).default([]),
          include: z.array(z.string()).default([]),
          exclude: z.array(z.string()).default([]),
          maxDepth: z.number().int().min(1).default(20),
        })
        .default({ enabled: true, extraFiles: [], include: [], exclude: [], maxDepth: 20 }),
    })
    .default({
      defaultMode: "staged" as const,
      instructions: ["REVIEW.md"],
      baseBranch: "main",
      fullFileContext: true,
      verify: true,
      timeoutMs: 180_000,
      maxConcurrency: 4,
      minConfidence: "medium" as const,
      rules: { enabled: true, extraFiles: [], include: [], exclude: [], maxDepth: 20 },
    }),
  suppress: z
    .object({
      files: z.array(z.string()).default([]),
      patterns: z.array(z.string()).default([]),
    })
    .default({ files: [], patterns: [] }),
  mcp: z.record(z.string(), McpServerSchema).default({}),
  disabled_agents: z.array(z.string()).default([]),
})

export type Config = z.infer<typeof ConfigSchema>
export type AgentConfig = z.infer<typeof AgentConfigSchema>
