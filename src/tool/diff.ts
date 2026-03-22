import { spawnSync } from "child_process"

export async function getDiff(
  mode: "staged" | "unstaged" | "branch",
  baseBranch: string = "main"
): Promise<string> {
  const args = {
    staged: ["diff", "--cached"],
    unstaged: ["diff"],
    branch: ["diff", `${baseBranch}...HEAD`],
  }[mode]

  const proc = spawnSync("git", args, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024 })
  if (proc.status !== 0) {
    throw new Error(`git diff failed: ${proc.stderr || "unknown error"}`)
  }
  return proc.stdout
}

export async function getAutoDetectedDiff(
  baseBranch: string = "main"
): Promise<{ diff: string; mode: string }> {
  const staged = await getDiff("staged", baseBranch)
  if (staged.trim()) return { diff: staged, mode: "staged" }

  const unstaged = await getDiff("unstaged", baseBranch)
  if (unstaged.trim()) return { diff: unstaged, mode: "unstaged" }

  const branch = await getDiff("branch", baseBranch)
  return { diff: branch, mode: "branch" }
}

export function getDiffStats(diff: string): {
  filesChanged: number
  insertions: number
  deletions: number
  files: string[]
} {
  const files: string[] = []
  let insertions = 0
  let deletions = 0

  for (const line of diff.split("\n")) {
    if (line.startsWith("diff --git")) {
      const match = line.match(/b\/(.+)$/)
      if (match) files.push(match[1])
    } else if (line.startsWith("+") && !line.startsWith("+++")) {
      insertions++
    } else if (line.startsWith("-") && !line.startsWith("---")) {
      deletions++
    }
  }

  return {
    filesChanged: files.length,
    insertions,
    deletions,
    files,
  }
}
