import type { Issue, ReviewResult } from "../types.js"

const NO_COLOR = !!process.env.NO_COLOR

const c = (code: string) => (NO_COLOR ? "" : code)
const RESET = c("\x1b[0m")
const BOLD = c("\x1b[1m")
const DIM = c("\x1b[2m")
const RED = c("\x1b[31m")
const GREEN = c("\x1b[32m")
const YELLOW = c("\x1b[33m")
const BLUE = c("\x1b[34m")
const CYAN = c("\x1b[36m")
const WHITE = c("\x1b[37m")

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
  const label =
    SEVERITY_LABELS[issue.severity] || issue.severity.toUpperCase()
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
  if (issue.patch) {
    lines.push(`  ${DIM}patch:${RESET}`)
    for (const line of issue.patch.split("\n")) {
      const prefix = line.startsWith("+")
        ? GREEN
        : line.startsWith("-")
          ? RED
          : DIM
      lines.push(`    ${prefix}${line}${RESET}`)
    }
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
    const meta = result.meta
    const extra = meta
      ? ` (${meta.filesChanged} files, ${meta.agentsRun} agents${meta.verified ? ", verified" : ""})`
      : ""
    return `\n  ${BOLD}OpenLens${RESET}  No issues found.${DIM}${extra}${RESET}\n`
  }

  const lines: string[] = []

  lines.push("")
  lines.push(
    `  ${BOLD}OpenLens${RESET}  ${result.issues.length} issue${result.issues.length === 1 ? "" : "s"} found`
  )
  lines.push(`  ${"─".repeat(50)}`)
  lines.push("")

  for (const issue of result.issues) {
    lines.push(formatIssue(issue))
    lines.push("")
  }

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
  if (warningCount > 0)
    parts.push(`${YELLOW}${warningCount} warning${RESET}`)
  if (infoCount > 0) parts.push(`${BLUE}${infoCount} info${RESET}`)

  lines.push(`  ${parts.join(", ")}`)

  if (Object.keys(result.timing).length > 0) {
    lines.push(`  ${DIM}${formatTiming(result.timing)}${RESET}`)
  }

  if (result.meta) {
    const m = result.meta
    const metaParts: string[] = []
    if (m.suppressed > 0) metaParts.push(`${m.suppressed} suppressed`)
    if (m.agentsFailed > 0) metaParts.push(`${m.agentsFailed} agents failed`)
    if (m.verified) metaParts.push("verified")
    if (metaParts.length > 0) {
      lines.push(`  ${DIM}${metaParts.join(", ")}${RESET}`)
    }
  }

  lines.push("")

  return lines.join("\n")
}

export function formatJson(result: ReviewResult): string {
  return JSON.stringify(result, null, 2)
}

// SARIF format for CI/CD integration (GitHub Actions, GitLab CI, etc.)
export function formatSarif(result: ReviewResult): string {
  const sarif = {
    version: "2.1.0",
    $schema:
      "https://raw.githubusercontent.com/oasis-tcs/sarif-spec/main/sarif-2.1/schema/sarif-schema-2.1.0.json",
    runs: [
      {
        tool: {
          driver: {
            name: "openlens",
            version: "0.1.0",
            informationUri: "https://github.com/Traves-Theberge/OpenLens",
            rules: [...new Set(result.issues.map((i) => i.agent))].map(
              (agent) => ({
                id: `openlens/${agent}`,
                shortDescription: { text: `OpenLens ${agent} agent` },
              })
            ),
          },
        },
        results: result.issues.map((issue) => ({
          ruleId: `openlens/${issue.agent}`,
          level:
            issue.severity === "critical"
              ? "error"
              : issue.severity === "warning"
                ? "warning"
                : "note",
          message: {
            text: `${issue.title}\n\n${issue.message}${issue.fix ? `\n\nFix: ${issue.fix}` : ""}`,
          },
          locations: [
            {
              physicalLocation: {
                artifactLocation: { uri: issue.file },
                region: {
                  startLine: issue.line,
                  ...(issue.endLine ? { endLine: issue.endLine } : {}),
                },
              },
            },
          ],
          ...(issue.patch
            ? {
                fixes: [
                  {
                    description: { text: issue.fix || "Suggested fix" },
                    artifactChanges: [
                      {
                        artifactLocation: { uri: issue.file },
                        replacements: [
                          {
                            deletedRegion: {
                              startLine: issue.line,
                              endLine: issue.endLine || issue.line,
                            },
                            insertedContent: { text: issue.patch },
                          },
                        ],
                      },
                    ],
                  },
                ],
              }
            : {}),
        })),
      },
    ],
  }

  return JSON.stringify(sarif, null, 2)
}
