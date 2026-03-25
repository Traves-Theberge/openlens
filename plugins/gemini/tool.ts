import { execSync } from "child_process"

export function review(params: {
  mode?: string
  agents?: string
  branch?: string
}): string {
  const args = ["run", "--format", "json"]

  if (params.mode === "unstaged") args.push("--unstaged")
  else if (params.mode === "branch" && params.branch) args.push("--branch", params.branch)
  else args.push("--staged")

  if (params.agents) args.push("--agents", params.agents)

  try {
    const output = execSync(`openlens ${args.join(" ")}`, {
      encoding: "utf-8",
      timeout: 300_000,
    })
    return output
  } catch (err: any) {
    return JSON.stringify({ error: err.message, issues: [], timing: {} })
  }
}
