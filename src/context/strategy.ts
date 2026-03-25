import { spawnSync } from "child_process"
import fs from "fs/promises"
import path from "path"

const MAX_FILES = 10
const MAX_LINES = 5000

type Strategy = "security" | "bugs" | "performance" | "style"

const SECURITY_MANIFESTS = ["package.json", "requirements.txt", "go.mod", "Cargo.toml", "pom.xml", "Gemfile"]
const SECURITY_PATTERNS = ["auth", "middleware", "session", "login", "password", "token", "secret"]
const STYLE_CONFIGS = [".eslintrc", ".eslintrc.json", ".eslintrc.js", ".prettierrc", ".prettierrc.json", "biome.json", ".editorconfig"]
const PERFORMANCE_PATTERNS = ["router", "handler", "middleware", "endpoint", "request", "response", "app.get", "app.post", "app.use"]

async function readFileIfExists(filePath: string, cwd: string): Promise<{ name: string; content: string } | null> {
  const resolved = path.resolve(cwd, filePath)
  if (!resolved.startsWith(cwd + path.sep)) return null
  try {
    const stat = await fs.stat(resolved)
    if (!stat.isFile()) return null
    const content = await fs.readFile(resolved, "utf-8")
    return { name: filePath, content }
  } catch {
    return null
  }
}

function grepForFiles(pattern: string, cwd: string): string[] {
  const result = spawnSync("grep", ["-rl", "--include=*.ts", "--include=*.js", "--include=*.py", "--include=*.go", pattern, "."], {
    cwd,
    encoding: "utf-8",
    timeout: 5000,
  })
  if (result.status !== 0) return []
  return result.stdout.trim().split("\n").filter(Boolean).map(f => f.replace(/^\.\//, ""))
}

function getChangedFunctionNames(diff: string): string[] {
  const names: string[] = []
  const patterns = [
    /^\+\s*(?:export\s+)?(?:async\s+)?function\s+(\w+)/gm,
    /^\+\s*(?:export\s+)?(?:const|let)\s+(\w+)\s*=\s*(?:async\s+)?(?:\(|function)/gm,
  ]
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(diff)) !== null) {
      if (match[1] && match[1].length > 2) names.push(match[1])
    }
  }
  return [...new Set(names)]
}

async function gatherSecurityContext(diff: string, cwd: string): Promise<string[]> {
  const files: { name: string; content: string }[] = []
  for (const manifest of SECURITY_MANIFESTS) {
    const f = await readFileIfExists(manifest, cwd)
    if (f) files.push(f)
  }
  for (const pattern of SECURITY_PATTERNS) {
    const matches = grepForFiles(pattern, cwd)
    for (const match of matches.slice(0, 3)) {
      if (files.length >= MAX_FILES) break
      const f = await readFileIfExists(match, cwd)
      if (f && !files.some(e => e.name === f.name)) files.push(f)
    }
  }
  return formatContextFiles(files)
}

async function gatherBugsContext(diff: string, cwd: string): Promise<string[]> {
  const funcNames = getChangedFunctionNames(diff)
  const files: { name: string; content: string }[] = []
  for (const name of funcNames.slice(0, 5)) {
    const callers = grepForFiles(name, cwd)
    for (const caller of callers.slice(0, 3)) {
      if (files.length >= MAX_FILES) break
      const f = await readFileIfExists(caller, cwd)
      if (f && !files.some(e => e.name === f.name)) files.push(f)
    }
  }
  return formatContextFiles(files)
}

async function gatherPerformanceContext(diff: string, cwd: string): Promise<string[]> {
  const files: { name: string; content: string }[] = []
  const funcNames = getChangedFunctionNames(diff)
  for (const name of funcNames.slice(0, 5)) {
    const callers = grepForFiles(name, cwd)
    for (const caller of callers.slice(0, 3)) {
      if (files.length >= MAX_FILES) break
      const f = await readFileIfExists(caller, cwd)
      if (f && !files.some(e => e.name === f.name)) files.push(f)
    }
  }
  for (const pattern of PERFORMANCE_PATTERNS) {
    if (files.length >= MAX_FILES) break
    const matches = grepForFiles(pattern, cwd)
    for (const match of matches.slice(0, 2)) {
      if (files.length >= MAX_FILES) break
      const f = await readFileIfExists(match, cwd)
      if (f && !files.some(e => e.name === f.name)) files.push(f)
    }
  }
  return formatContextFiles(files)
}

async function gatherStyleContext(diff: string, cwd: string): Promise<string[]> {
  const files: { name: string; content: string }[] = []
  for (const config of STYLE_CONFIGS) {
    const f = await readFileIfExists(config, cwd)
    if (f) files.push(f)
  }
  return formatContextFiles(files)
}

function formatContextFiles(files: { name: string; content: string }[]): string[] {
  const sections: string[] = []
  let totalLines = 0
  for (const file of files.slice(0, MAX_FILES)) {
    const lines = file.content.split("\n")
    const remaining = MAX_LINES - totalLines
    if (remaining <= 0) break
    const truncated = lines.length > remaining
      ? lines.slice(0, remaining).join("\n") + `\n\n... (truncated, ${lines.length} total lines)`
      : file.content
    sections.push(`### ${file.name}\n\`\`\`\n${truncated}\n\`\`\``)
    totalLines += Math.min(lines.length, remaining)
  }
  return sections
}

export async function gatherStrategyContext(
  strategy: Strategy | undefined,
  diff: string,
  cwd: string
): Promise<string> {
  if (!strategy) return ""
  let sections: string[]
  switch (strategy) {
    case "security": sections = await gatherSecurityContext(diff, cwd); break
    case "bugs": sections = await gatherBugsContext(diff, cwd); break
    case "performance": sections = await gatherPerformanceContext(diff, cwd); break
    case "style": sections = await gatherStyleContext(diff, cwd); break
    default: return ""
  }
  if (sections.length === 0) return ""
  return "## Additional context (auto-gathered)\n\n" + sections.join("\n\n")
}
