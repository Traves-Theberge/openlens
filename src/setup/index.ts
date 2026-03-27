import * as p from "@clack/prompts"
import { setupConfig } from "./config.js"
import { setupAgents } from "./agents.js"
import { setupHooks } from "./hooks.js"
import { setupPlugins } from "./plugins.js"
import { setupCICD } from "./cicd.js"

export interface SetupOptions {
  config?: boolean
  hooks?: boolean
  plugins?: boolean
  ci?: boolean
  agents?: boolean
  yes?: boolean
}

export async function runSetup(cwd: string, options: SetupOptions = {}) {
  const runAll =
    !options.config &&
    !options.hooks &&
    !options.plugins &&
    !options.ci &&
    !options.agents

  p.intro("OpenLens Setup")

  const config =
    runAll || options.config ? await setupConfig(cwd, options) : null
  if (runAll || options.agents) await setupAgents(cwd, config, options)

  if (runAll || options.hooks) await setupHooks(cwd, options)
  if (runAll || options.plugins) await setupPlugins(cwd, options)
  if (runAll || options.ci) await setupCICD(cwd, options)

  p.outro("Setup complete!")
}
