import { resolve, join } from "path"
import { existsSync } from "fs"

/**
 * Detect if running in a CI environment and which provider.
 */
export function detectCI(): {
  isCI: boolean
  provider?: string
} {
  const env = process.env

  if (env.CI === "true" || env.CI === "1") {
    if (env.GITHUB_ACTIONS === "true") return { isCI: true, provider: "github" }
    if (env.GITLAB_CI === "true") return { isCI: true, provider: "gitlab" }
    if (env.CIRCLECI === "true") return { isCI: true, provider: "circleci" }
    if (env.BUILDKITE === "true") return { isCI: true, provider: "buildkite" }
    if (env.JENKINS_URL) return { isCI: true, provider: "jenkins" }
    if (env.TRAVIS === "true") return { isCI: true, provider: "travis" }
    return { isCI: true, provider: "unknown" }
  }

  // Some CI systems don't set CI=true
  if (env.GITHUB_ACTIONS === "true") return { isCI: true, provider: "github" }
  if (env.GITLAB_CI === "true") return { isCI: true, provider: "gitlab" }

  return { isCI: false }
}

/**
 * Resolve the path to the `opencode` binary.
 *
 * Priority:
 * 1. OPENCODE_BIN environment variable (explicit override)
 * 2. Bundled binary in node_modules/.bin/opencode (standalone)
 * 3. Global `opencode` in PATH (fallback)
 */
export function resolveOpencodeBin(cwd?: string): string {
  // 1. Explicit override
  if (process.env.OPENCODE_BIN) {
    return process.env.OPENCODE_BIN
  }

  // 2. Bundled binary — walk up from this file to find node_modules
  const searchDirs = [
    cwd,
    resolve(__dirname, ".."),           // src/../ = project root
    resolve(__dirname, "../.."),         // deeper nesting
    process.cwd(),
  ].filter(Boolean) as string[]

  for (const dir of searchDirs) {
    const binPath = join(dir, "node_modules", ".bin", "opencode")
    if (existsSync(binPath)) {
      return binPath
    }
  }

  // 3. Fallback to global PATH
  return "opencode"
}

/**
 * Infer base branch for CI diff comparison.
 */
export function inferBaseBranch(): string | undefined {
  const env = process.env

  // GitHub Actions PR
  if (env.GITHUB_BASE_REF) return env.GITHUB_BASE_REF

  // GitLab MR
  if (env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME)
    return env.CI_MERGE_REQUEST_TARGET_BRANCH_NAME

  // Buildkite
  if (env.BUILDKITE_PULL_REQUEST_BASE_BRANCH)
    return env.BUILDKITE_PULL_REQUEST_BASE_BRANCH

  return undefined
}
