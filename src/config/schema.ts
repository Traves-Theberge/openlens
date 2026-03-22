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
        .enum(["staged", "unstaged", "branch"])
        .default("staged"),
      instructions: z.array(z.string()).default(["REVIEW.md"]),
      baseBranch: z.string().default("main"),
    })
    .default({}),
  mcp: z.record(z.string(), McpServerSchema).default({}),
  disabled_agents: z.array(z.string()).default([]),
})

export type Config = z.infer<typeof ConfigSchema>
export type AgentConfig = z.infer<typeof AgentConfigSchema>
