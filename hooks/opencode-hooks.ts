/**
 * OpenCode hook plugin for openlens
 *
 * Blocks git commit/push when critical issues are found.
 * Only triggers on git commit and git push — not on file writes.
 */
import { type Plugin } from "@opencode-ai/plugin"
import { execSync } from "child_process"

const AGENTS = process.env.OPENLENS_AGENTS || "security,bugs"

const plugin: Plugin = async ({ directory }) => ({
  "tool.execute.before": async (input, output) => {
    if (input.tool !== "bash") return

    const cmd = (output.args as any)?.command || ""
    if (!/^git\s+(commit|push)/.test(cmd)) return

    try {
      execSync(
        `openlens run --staged --agents ${AGENTS} --no-verify --no-context --format text`,
        { cwd: directory, encoding: "utf-8", timeout: 120_000 }
      )
    } catch (err: any) {
      if (err.status === 1) {
        throw new Error(
          "openlens found critical issues. Fix them before committing.\n\n" +
          (err.stdout || "")
        )
      }
    }
  },
})

export default plugin
