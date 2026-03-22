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
})

export type Issue = z.infer<typeof IssueSchema>

export const ReviewResultSchema = z.object({
  issues: z.array(IssueSchema),
  timing: z.record(z.string(), z.number()),
})

export type ReviewResult = z.infer<typeof ReviewResultSchema>

export const IssueArraySchema = z.array(
  z.object({
    file: z.string(),
    line: z.number(),
    endLine: z.number().optional(),
    severity: z.enum(["critical", "warning", "info"]),
    title: z.string(),
    message: z.string(),
    fix: z.string().optional(),
  })
)
