import * as p from "@clack/prompts"
import fs from "fs/promises"
import path from "path"
import { fileURLToPath } from "url"
import type { SetupOptions } from "./index.js"

interface Platform {
  name: string
  detected: boolean
  skillSrc: string
  skillDst: string
  hookSrc: string
  hookDst: string
  hookMerge: boolean // true = merge into existing settings, false = create new file
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p)
    return true
  } catch {
    return false
  }
}

export async function setupPlugins(cwd: string, options: SetupOptions) {
  p.log.step("Platform Plugins")

  const home = process.env.HOME || process.env.USERPROFILE || ""
  const srcDir = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../",
  )

  // Detect platforms
  const platforms: Platform[] = [
    {
      name: "Claude Code",
      detected: await exists(path.join(home, ".claude")),
      skillSrc: path.join(srcDir, "plugins/claude-code"),
      skillDst: path.join(home, ".claude/skills/openlens"),
      hookSrc: path.join(srcDir, "hooks/claude-code-hooks.json"),
      hookDst: path.join(cwd, ".claude/settings.json"),
      hookMerge: true,
    },
    {
      name: "Codex CLI",
      detected: await exists(path.join(home, ".codex")),
      skillSrc: path.join(srcDir, "plugins/codex"),
      skillDst: path.join(home, ".codex/skills/openlens"),
      hookSrc: path.join(srcDir, "hooks/codex-hooks.json"),
      hookDst: path.join(cwd, ".codex/hooks.json"),
      hookMerge: false,
    },
    {
      name: "Gemini CLI",
      detected: await exists(path.join(home, ".gemini")),
      skillSrc: path.join(srcDir, "plugins/gemini/openlens.toml"),
      skillDst: path.join(cwd, ".gemini/commands/openlens.toml"),
      hookSrc: path.join(srcDir, "hooks/gemini-hooks.json"),
      hookDst: path.join(cwd, ".gemini/settings.json"),
      hookMerge: true,
    },
  ]

  const detected = platforms.filter((pl) => pl.detected)

  if (detected.length === 0) {
    p.log.info("No AI coding platforms detected. Skipping plugins.")
    return
  }

  // Select which platforms to configure
  let selectedPlatforms = detected
  if (!options.yes) {
    const selected = await p.multiselect({
      message: `Detected ${detected.length} platform(s). Which do you want to configure?`,
      options: detected.map((pl) => ({ value: pl.name, label: pl.name })),
      initialValues: detected.map((pl) => pl.name),
    })
    if (p.isCancel(selected)) {
      p.cancel("Setup cancelled.")
      process.exit(0)
    }
    selectedPlatforms = detected.filter((pl) =>
      (selected as string[]).includes(pl.name),
    )
  }

  for (const platform of selectedPlatforms) {
    // Install slash command / skill
    try {
      await fs.mkdir(path.dirname(platform.skillDst), { recursive: true })

      if (platform.name === "Gemini CLI") {
        // Gemini: copy single file
        const content = await fs.readFile(platform.skillSrc, "utf-8")
        await fs.writeFile(platform.skillDst, content)
      } else {
        // Claude Code / Codex: symlink or copy directory
        if (await exists(platform.skillDst)) {
          p.log.info(`${platform.name} skill already installed`)
        } else {
          try {
            await fs.symlink(platform.skillSrc, platform.skillDst)
          } catch {
            // Symlink failed, copy instead
            await fs.mkdir(platform.skillDst, { recursive: true })
            const files = await fs.readdir(platform.skillSrc)
            for (const file of files) {
              const content = await fs.readFile(
                path.join(platform.skillSrc, file),
                "utf-8",
              )
              await fs.writeFile(path.join(platform.skillDst, file), content)
            }
          }
        }
      }
      p.log.success(`${platform.name}: installed slash command`)
    } catch (err: any) {
      p.log.warn(
        `${platform.name}: could not install skill - ${err.message}`,
      )
    }

    // Install platform hooks
    let installHook = true
    if (!options.yes) {
      installHook = (await p.confirm({
        message: `${platform.name}: install hook to review before git commit/push?`,
        initialValue: true,
      })) as boolean
      if (p.isCancel(installHook)) {
        p.cancel("Setup cancelled.")
        process.exit(0)
      }
    }

    if (installHook) {
      try {
        await fs.mkdir(path.dirname(platform.hookDst), { recursive: true })
        const hookContent = await fs.readFile(platform.hookSrc, "utf-8")

        if (platform.hookMerge && (await exists(platform.hookDst))) {
          // Merge hooks into existing settings
          const existingRaw = await fs.readFile(platform.hookDst, "utf-8")
          const existing = JSON.parse(existingRaw)
          const newHooks = JSON.parse(hookContent)

          // Merge hooks object
          if (!existing.hooks) existing.hooks = {}
          for (const [event, handlers] of Object.entries(
            newHooks.hooks || {},
          )) {
            if (!existing.hooks[event]) existing.hooks[event] = []
            existing.hooks[event].push(...(handlers as any[]))
          }
          if (newHooks.hooksConfig) {
            existing.hooksConfig = {
              ...existing.hooksConfig,
              ...newHooks.hooksConfig,
            }
          }

          await fs.writeFile(
            platform.hookDst,
            JSON.stringify(existing, null, 2) + "\n",
          )
          p.log.success(`${platform.name}: merged hooks into settings`)
        } else {
          await fs.writeFile(platform.hookDst, hookContent)
          p.log.success(`${platform.name}: installed hooks`)
        }
      } catch (err: any) {
        p.log.warn(
          `${platform.name}: could not install hooks - ${err.message}`,
        )
      }
    }
  }

  // Check for OpenCode
  const hasOpenCode = await exists(path.join(cwd, "opencode.json"))
  if (hasOpenCode && !options.yes) {
    const addPlugin = (await p.confirm({
      message: "Add openlens plugin to opencode.json?",
      initialValue: true,
    })) as boolean
    if (!p.isCancel(addPlugin) && addPlugin) {
      try {
        const raw = await fs.readFile(
          path.join(cwd, "opencode.json"),
          "utf-8",
        )
        const config = JSON.parse(raw)
        if (!config.plugin) config.plugin = []
        if (!config.plugin.includes("openlens")) {
          config.plugin.push("openlens")
          await fs.writeFile(
            path.join(cwd, "opencode.json"),
            JSON.stringify(config, null, 2) + "\n",
          )
          p.log.success("OpenCode: added openlens plugin")
        } else {
          p.log.info("OpenCode: openlens plugin already configured")
        }
      } catch (err: any) {
        p.log.warn(`OpenCode: could not update config - ${err.message}`)
      }
    }
  }
}
