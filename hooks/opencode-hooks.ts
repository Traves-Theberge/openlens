/**
 * OpenCode hook plugin for OpenLens
 *
 * Adds automatic code review after file writes and before git commit/push.
 *
 * Usage: Add to your OpenCode plugin that extends the base OpenLens plugin,
 * or use standalone by copying into your own plugin file.
 *
 * The base OpenLens plugin (src/plugin.ts) registers tools.
 * This hook plugin adds automatic review triggers.
 */
import { type Plugin } from "@opencode-ai/plugin"
import { execSync } from "child_process"

const WRITE_TOOLS = new Set(["write", "edit", "patch"])
const AGENTS = process.env.OPENLENS_AGENTS || "security,bugs"

function runReview(cwd: string, mode: "post-write" | "pre-commit"): string | null {
  try {
    const agents = mode === "pre-commit" ? AGENTS : AGENTS
    const result = execSync(
      `openlens run --staged --agents ${agents} --no-verify --no-context --format text`,
      { cwd, encoding: "utf-8", timeout: 120_000 }
    )
    return result.trim() || null
  } catch (err: any) {
    // Exit code 1 = critical issues found
    if (err.status === 1 && err.stdout) {
      return err.stdout.trim()
    }
    return null
  }
}

const plugin: Plugin = async ({ directory }) => {
  return {
    // Review after file writes — appends findings to tool output
    "tool.execute.after": async (input, output) => {
      if (!WRITE_TOOLS.has(input.tool)) return

      const review = runReview(directory, "post-write")
      if (review) {
        output.output += "\n\n--- OpenLens Review ---\n" + review
      }
    },

    // Block git commit/push if critical issues — intercept bash tool
    "tool.execute.before": async (input, output) => {
      if (input.tool !== "bash") return

      const cmd = (output.args as any)?.command || ""
      if (!/^git\s+(commit|push)/.test(cmd)) return

      const review = runReview(directory, "pre-commit")
      if (review && review.includes("critical")) {
        throw new Error(
          "OpenLens found critical issues. Fix them before committing.\n\n" + review
        )
      }
    },
  }
}

export default plugin
