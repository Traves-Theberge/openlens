import type { Issue, ReviewResult } from "../types.js"

// ANSI color codes
const RESET = "\x1b[0m"
const BOLD = "\x1b[1m"
const DIM = "\x1b[2m"
const RED = "\x1b[31m"
const YELLOW = "\x1b[33m"
const BLUE = "\x1b[34m"
const CYAN = "\x1b[36m"
const WHITE = "\x1b[37m"

const SEVERITY_COLORS: Record<string, string> = {
  critical: RED,
  warning: YELLOW,
  info: BLUE,
}

const SEVERITY_LABELS: Record<string, string> = {
  critical: "CRITICAL",
  warning: "WARNING",
  info: "INFO",
}

function formatIssue(issue: Issue): string {
  const color = SEVERITY_COLORS[issue.severity] || WHITE
  const label = SEVERITY_LABELS[issue.severity] || issue.severity.toUpperCase()
  const location = issue.endLine
    ? `${issue.file}:${issue.line}-${issue.endLine}`
    : `${issue.file}:${issue.line}`

  const lines: string[] = []

  lines.push(
    `  ${color}${BOLD}${label}${RESET}  ${WHITE}${location}${RESET}  ${DIM}[${issue.agent}]${RESET}`
  )
  lines.push(`  ${issue.title}`)
  if (issue.message) {
    lines.push(`  ${DIM}${issue.message}${RESET}`)
  }
  if (issue.fix) {
    lines.push(`  ${CYAN}→ ${issue.fix}${RESET}`)
  }

  return lines.join("\n")
}

function formatTiming(timing: Record<string, number>): string {
  return Object.entries(timing)
    .map(([name, ms]) => `${name}: ${(ms / 1000).toFixed(1)}s`)
    .join(", ")
}

export function formatText(result: ReviewResult): string {
  if (result.issues.length === 0) {
    return `\n  ${BOLD}OpenReview${RESET}  No issues found.\n`
  }

  const lines: string[] = []

  lines.push("")
  lines.push(
    `  ${BOLD}OpenReview${RESET}  ${result.issues.length} issue${result.issues.length === 1 ? "" : "s"} found`
  )
  lines.push(`  ${"─".repeat(50)}`)
  lines.push("")

  for (const issue of result.issues) {
    lines.push(formatIssue(issue))
    lines.push("")
  }

  // Summary
  const criticalCount = result.issues.filter(
    (i) => i.severity === "critical"
  ).length
  const warningCount = result.issues.filter(
    (i) => i.severity === "warning"
  ).length
  const infoCount = result.issues.filter(
    (i) => i.severity === "info"
  ).length

  const parts: string[] = []
  if (criticalCount > 0) parts.push(`${RED}${criticalCount} critical${RESET}`)
  if (warningCount > 0) parts.push(`${YELLOW}${warningCount} warning${RESET}`)
  if (infoCount > 0) parts.push(`${BLUE}${infoCount} info${RESET}`)

  lines.push(`  ${parts.join(", ")}`)

  if (Object.keys(result.timing).length > 0) {
    lines.push(`  ${DIM}${formatTiming(result.timing)}${RESET}`)
  }

  lines.push("")

  return lines.join("\n")
}

export function formatJson(result: ReviewResult): string {
  return JSON.stringify(result, null, 2)
}
