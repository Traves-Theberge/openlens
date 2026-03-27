import type { ReviewResult, Issue } from "../types.js"
import { createHash } from "crypto"

export interface GitHubReviewComment {
  path: string
  line: number
  start_line?: number
  body: string
}

export interface GitHubReview {
  event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT"
  body: string
  comments: GitHubReviewComment[]
  fingerprints: Record<string, { file: string; title: string; agent: string; line: number }>
}

function fingerprint(issue: Issue): string {
  return createHash("sha256")
    .update(`${issue.file}\x00${issue.title}\x00${issue.agent}`)
    .digest("hex")
    .slice(0, 16)
}

function formatCommentBody(issue: Issue): string {
  const parts = [
    `**${issue.severity.toUpperCase()}** — ${issue.title}`,
    "",
    issue.message,
  ]
  if (issue.fix) {
    parts.push("", `**Fix:** ${issue.fix}`)
  }
  if (issue.patch) {
    parts.push("", "```diff", issue.patch, "```")
  }
  parts.push("", `_Agent: ${issue.agent}_`)
  return parts.join("\n")
}

export function formatGitHubReview(result: ReviewResult): GitHubReview {
  const hasCritical = result.issues.some(i => i.severity === "critical")
  const hasIssues = result.issues.length > 0

  const event = hasCritical ? "REQUEST_CHANGES" : hasIssues ? "COMMENT" : "APPROVE"

  const comments: GitHubReviewComment[] = result.issues.map(issue => ({
    path: issue.file,
    line: issue.endLine || issue.line,
    ...(issue.endLine && issue.endLine !== issue.line ? { start_line: issue.line } : {}),
    body: formatCommentBody(issue),
  }))

  const fingerprints: Record<string, { file: string; title: string; agent: string; line: number }> = {}
  for (const issue of result.issues) {
    fingerprints[fingerprint(issue)] = {
      file: issue.file,
      title: issue.title,
      agent: issue.agent,
      line: issue.line,
    }
  }

  const summary = hasIssues
    ? `openlens found **${result.issues.length} issue(s)** across ${result.meta?.filesChanged || "?"} files.`
    : "openlens found no issues."

  return { event, body: summary, comments, fingerprints }
}
