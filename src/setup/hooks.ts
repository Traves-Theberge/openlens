import * as p from "@clack/prompts"
import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import type { SetupOptions } from "./index.js"

export async function setupHooks(cwd: string, options: SetupOptions) {
  p.log.step("Git Hooks")

  // Check if we're in a git repo
  try {
    await fs.access(path.join(cwd, ".git"))
  } catch {
    p.log.warn("Not a git repository - skipping hooks.")
    return
  }

  let installPreCommit = true
  let installPrePush = true

  if (!options.yes) {
    installPreCommit = (await p.confirm({
      message: "Install pre-commit hook? (reviews staged changes)",
      initialValue: true,
    })) as boolean
    if (p.isCancel(installPreCommit)) {
      p.cancel("Setup cancelled.")
      process.exit(0)
    }

    installPrePush = (await p.confirm({
      message: "Install pre-push hook? (reviews branch diff)",
      initialValue: true,
    })) as boolean
    if (p.isCancel(installPrePush)) {
      p.cancel("Setup cancelled.")
      process.exit(0)
    }
  }

  if (!installPreCommit && !installPrePush) {
    p.log.info("No hooks selected.")
    return
  }

  const hooksDir = path.join(cwd, ".git", "hooks")
  await fs.mkdir(hooksDir, { recursive: true })

  const srcHooksDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../hooks",
  )
  const hooks = []
  if (installPreCommit) hooks.push("pre-commit")
  if (installPrePush) hooks.push("pre-push")

  for (const hook of hooks) {
    const src = path.join(srcHooksDir, hook)
    const dst = path.join(hooksDir, hook)

    try {
      const existing = await fs.readFile(dst, "utf-8")
      if (existing.includes("openlens")) {
        p.log.info(`.git/hooks/${hook} already installed`)
        continue
      }
      // Backup existing hook
      await fs.writeFile(dst + ".backup", existing)
      p.log.warn(`Backed up existing .git/hooks/${hook}`)
    } catch {
      // No existing hook
    }

    const content = await fs.readFile(src, "utf-8")
    await fs.writeFile(dst, content, { mode: 0o755 })
    p.log.success(`Installed .git/hooks/${hook}`)
  }

  p.log.info("Skip hooks with: OPENLENS_SKIP=1 git commit")
}
