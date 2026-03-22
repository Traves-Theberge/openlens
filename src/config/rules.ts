import path from "path"
import fs from "fs/promises"

/**
 * OpenCode-style rules discovery.
 *
 * Walks up from the working directory to the repo root, collecting rules files
 * (AGENTS.md, CLAUDE.md, and custom patterns). Files closer to the working
 * directory take precedence (appended last → override earlier context).
 */

/** Well-known rules file names discovered automatically. */
const WELL_KNOWN_FILES = [
  "AGENTS.md",
  "CLAUDE.md",
  ".openlens/rules.md",
]

export interface RulesDiscoveryConfig {
  /** Enable automatic directory-walking discovery (default: true) */
  enabled?: boolean
  /** Additional file names to look for (e.g. ["REVIEW_RULES.md"]) */
  extraFiles?: string[]
  /** Glob patterns for rules files (e.g. [".openlens/rules/*.md"]) */
  include?: string[]
  /** Glob patterns to exclude from discovery */
  exclude?: string[]
  /** Maximum directories to walk up from cwd (default: 20) */
  maxDepth?: number
}

export interface DiscoveredRule {
  /** Absolute path to the rules file */
  filePath: string
  /** Relative path from the repo root */
  relativePath: string
  /** File content */
  content: string
  /** How it was discovered: "well-known" | "extra" | "glob" | "config" */
  source: "well-known" | "extra" | "glob" | "config"
}

/**
 * Find the git repository root by walking up from `cwd`.
 */
async function findRepoRoot(cwd: string): Promise<string | null> {
  let dir = path.resolve(cwd)
  while (true) {
    try {
      await fs.access(path.join(dir, ".git"))
      return dir
    } catch {
      const parent = path.dirname(dir)
      if (parent === dir) return null
      dir = parent
    }
  }
}

/**
 * Walk from `startDir` up to `stopDir` (inclusive), returning directories
 * from root → leaf order so that deeper files are appended last.
 */
function walkUp(startDir: string, stopDir: string): string[] {
  const dirs: string[] = []
  let dir = path.resolve(startDir)
  const stop = path.resolve(stopDir)

  while (true) {
    dirs.push(dir)
    if (dir === stop) break
    const parent = path.dirname(dir)
    if (parent === dir) break
    dir = parent
  }

  // Reverse: root-first so deeper directories append later (higher priority)
  return dirs.reverse()
}

/**
 * Convert a glob pattern to a RegExp.
 */
function globToRegex(pattern: string): RegExp {
  const regex = pattern
    .replace(/\*\*/g, "§DOUBLESTAR§")
    .replace(/\*/g, "[^/]*")
    .replace(/§DOUBLESTAR§/g, ".*")
    .replace(/\?/g, ".")
  return new RegExp(`^${regex}$`)
}

/**
 * Check if a path matches any exclude pattern.
 */
function isExcluded(relativePath: string, excludePatterns: string[]): boolean {
  for (const pattern of excludePatterns) {
    if (globToRegex(pattern).test(relativePath)) return true
  }
  return false
}

/**
 * Recursively walk a directory and return all file paths (relative to root).
 */
async function walkDir(dir: string, root: string): Promise<string[]> {
  const results: string[] = []

  let entries: import("fs").Dirent[]
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return results
  }

  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".git") continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      results.push(...(await walkDir(full, root)))
    } else if (entry.isFile()) {
      results.push(path.relative(root, full))
    }
  }

  return results
}

/**
 * Discover rules files by walking up from `cwd` to the repo root.
 *
 * Returns discovered rules in root→leaf order (deeper = higher priority).
 * Deduplicates by absolute path.
 */
export async function discoverRules(
  cwd: string,
  options: RulesDiscoveryConfig = {}
): Promise<DiscoveredRule[]> {
  const {
    enabled = true,
    extraFiles = [],
    include = [],
    exclude = [],
    maxDepth = 20,
  } = options

  if (!enabled) return []

  const repoRoot = await findRepoRoot(cwd)
  const stopDir = repoRoot || cwd
  const dirs = walkUp(cwd, stopDir).slice(0, maxDepth)

  const seen = new Set<string>()
  const rules: DiscoveredRule[] = []

  const addRule = (
    filePath: string,
    content: string,
    source: DiscoveredRule["source"]
  ) => {
    const resolved = path.resolve(filePath)
    if (seen.has(resolved)) return
    seen.add(resolved)
    rules.push({
      filePath: resolved,
      relativePath: path.relative(stopDir, resolved),
      content,
      source,
    })
  }

  // Phase 1: Walk directories for well-known files and extra files
  const fileNames = [...WELL_KNOWN_FILES, ...extraFiles]

  for (const dir of dirs) {
    for (const fileName of fileNames) {
      const filePath = path.join(dir, fileName)
      try {
        const content = await fs.readFile(filePath, "utf-8")
        const source = WELL_KNOWN_FILES.includes(fileName)
          ? "well-known"
          : "extra"
        addRule(filePath, content, source as DiscoveredRule["source"])
      } catch {
        // File doesn't exist — skip
      }
    }
  }

  // Phase 2: Resolve glob patterns relative to repo root
  if (include.length > 0 && repoRoot) {
    const allFiles = await walkDir(repoRoot, repoRoot)
    const regexes = include.map(globToRegex)

    for (const rel of allFiles) {
      const matches = regexes.some((rx) => rx.test(rel))
      if (!matches) continue
      if (isExcluded(rel, exclude)) continue

      const full = path.join(repoRoot, rel)
      try {
        const content = await fs.readFile(full, "utf-8")
        addRule(full, content, "glob")
      } catch {
        // Can't read — skip
      }
    }
  }

  return rules
}

/**
 * Format discovered rules into a single markdown string suitable for
 * injection into agent prompts.
 */
export function formatDiscoveredRules(rules: DiscoveredRule[]): string {
  if (rules.length === 0) return ""

  const sections = rules.map(
    (r) => `# From: ${r.relativePath}\n\n${r.content}`
  )
  return sections.join("\n\n---\n\n")
}
