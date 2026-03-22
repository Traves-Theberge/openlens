import { z } from "zod"

export const IssueSchema = z.object({
  file: z.string(),
  line: z.number(),
  endLine: z.number().optional(),
  severity: z.enum(["critical", "warning", "info"]),
  agent: z.string(),
  title: z.string(),
  message: z.string(),
  fix: z.string().optional(),
  patch: z.string().optional(),
})

export type Issue = z.infer<typeof IssueSchema>

export const IssueArraySchema = z.array(
  z.object({
    file: z.string(),
    line: z.number(),
    endLine: z.number().optional(),
    severity: z.enum(["critical", "warning", "info"]),
    title: z.string(),
    message: z.string(),
    fix: z.string().optional(),
    patch: z.string().optional(),
  })
)

export const ReviewResultSchema = z.object({
  issues: z.array(IssueSchema),
  timing: z.record(z.string(), z.number()),
  meta: z
    .object({
      mode: z.string(),
      filesChanged: z.number(),
      agentsRun: z.number(),
      agentsFailed: z.number(),
      suppressed: z.number(),
      verified: z.boolean(),
    })
    .optional(),
})

export type ReviewResult = z.infer<typeof ReviewResultSchema>
