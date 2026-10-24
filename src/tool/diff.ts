import { spawnSync } from "child_process"

export async function getDiff(
  mode: "staged" | "unstaged" | "branch",
  baseBranch: string = "main",
  cwd?: string
): Promise<string> {
  const args = {
    staged: ["diff", "--cached", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/"],
    unstaged: ["diff", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/"],
    branch: ["diff", "--no-ext-diff", "--src-prefix=a/", "--dst-prefix=b/", `${baseBranch}...HEAD`],
  }[mode]

  const proc = spawnSync("git", args, { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024, cwd })
  if (proc.status !== 0) {
    throw new Error(`git diff failed: ${proc.stderr || "unknown error"}`)
  }
  return proc.stdout
}

export async function getAutoDetectedDiff(
  baseBranch: string = "main",
  cwd?: string
): Promise<{ diff: string; mode: string }> {
  const staged = await getDiff("staged", baseBranch, cwd)
  if (staged.trim()) return { diff: staged, mode: "staged" }

  const unstaged = await getDiff("unstaged", baseBranch, cwd)
  if (unstaged.trim()) return { diff: unstaged, mode: "unstaged" }

  const branch = await getDiff("branch", baseBranch, cwd)
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
      const quoted = line.match(/^diff --git "(?:[a-zA-Z]\/)?(.*?)" "(?:[a-zA-Z]\/)?(.*?)"$/)
      if (quoted) {
        files.push(quoted[2])
      } else {
        const unquoted = line.match(/^diff --git (?:[a-zA-Z]\/)?(\S+)\s+(?:[a-zA-Z]\/)?(\S+)$/)
        if (unquoted) {
          files.push(unquoted[2])
        } else {
          const match = line.match(/b\/(.+)$/)
          if (match) files.push(match[1])
        }
      }
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
