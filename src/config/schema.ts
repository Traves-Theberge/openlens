import { z } from "zod"

export const McpServerSchema = z.object({
  type: z.enum(["local", "remote"]).default("local"),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().optional(),
  environment: z.record(z.string(), z.string()).optional(),
  enabled: z.boolean().default(true),
})

export const AgentConfigSchema = z.object({
  description: z.string().optional(),
  model: z.string().optional(),
  prompt: z.string().optional(),
  enabled: z.boolean().default(true),
  // OpenCode-style agent capabilities
  tools: z
    .record(z.string(), z.boolean())
    .optional()
    .describe("Tool access: { read: true, grep: true, bash: false }"),
  permission: z
    .record(z.string(), z.enum(["allow", "deny", "ask"]))
    .optional()
    .describe("Permission rules per tool"),
  temperature: z.number().min(0).max(2).optional(),
  maxTurns: z.number().int().min(1).optional().describe("Max agentic loop iterations"),
  system: z.string().optional().describe("System prompt override sent to OpenCode"),
})

export const ConfigSchema = z.object({
  $schema: z.string().optional(),
  model: z.string().default("anthropic/claude-sonnet-4-20250514"),
  agent: z.record(z.string(), AgentConfigSchema).default({}),
  server: z
    .object({
      port: z.number().default(4096),
      hostname: z.string().default("localhost"),
    })
    .default({}),
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
    })
    .default({}),
  suppress: z
    .object({
      files: z.array(z.string()).default([]),
      patterns: z.array(z.string()).default([]),
    })
    .default({}),
  mcp: z.record(z.string(), McpServerSchema).default({}),
  disabled_agents: z.array(z.string()).default([]),
})

export type Config = z.infer<typeof ConfigSchema>
export type AgentConfig = z.infer<typeof AgentConfigSchema>
