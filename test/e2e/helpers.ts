import { spawnSync, type SpawnSyncReturns } from "child_process"
import fs from "fs"
import path from "path"
import os from "os"

const CLI_PATH = path.resolve(__dirname, "../../src/index.ts")

export interface RunResult {
  stdout: string
  stderr: string
  exitCode: number | null
}

/**
 * Run the openlens CLI with the given arguments in the specified working directory.
 * Uses `bun run` to execute the TypeScript source directly.
 */
export function run(args: string[], cwd: string, env?: Record<string, string>): RunResult {
  const result: SpawnSyncReturns<string> = spawnSync(
    "bun",
    ["run", CLI_PATH, ...args],
    {
      cwd,
      encoding: "utf-8",
      timeout: 30_000,
      env: {
        ...process.env,
        // Ensure deterministic output
        NO_COLOR: "1",
        // Prevent CI auto-detection from affecting tests
        CI: "",
        GITHUB_ACTIONS: "",
        GITLAB_CI: "",
        ...env,
      },
    }
  )

  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    exitCode: result.status,
  }
}

/**
 * Create a temporary directory with a git repository initialized.
 * Returns the path to the temp directory.
 */
export function createTempGitRepo(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "openlens-test-"))

  spawnSync("git", ["init"], { cwd: dir })
  spawnSync("git", ["config", "user.email", "test@test.com"], { cwd: dir })
  spawnSync("git", ["config", "user.name", "Test"], { cwd: dir })
  // Disable commit signing for test repos
  spawnSync("git", ["config", "commit.gpgsign", "false"], { cwd: dir })

  // Create an initial commit so HEAD exists
  fs.writeFileSync(path.join(dir, "README.md"), "# Test Project\n")
  spawnSync("git", ["add", "."], { cwd: dir })
  spawnSync("git", ["commit", "-m", "initial commit"], { cwd: dir })

  return dir
}

/**
 * Add a file to the temp repo and stage it.
 */
export function addStagedFile(dir: string, name: string, content: string): void {
  const filePath = path.join(dir, name)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
  spawnSync("git", ["add", name], { cwd: dir })
}

/**
 * Add a file to the temp repo without staging it.
 */
export function addUnstagedFile(dir: string, name: string, content: string): void {
  const filePath = path.join(dir, name)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
}

/**
 * Create a committed file, then modify it and stage the modification.
 */
export function addModifiedFile(dir: string, name: string, before: string, after: string): void {
  const filePath = path.join(dir, name)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, before)
  spawnSync("git", ["add", name], { cwd: dir })
  spawnSync("git", ["commit", "-m", `add ${name}`], { cwd: dir })
  fs.writeFileSync(filePath, after)
  spawnSync("git", ["add", name], { cwd: dir })
}

/**
 * Write an openlens.json config file into the directory.
 */
export function writeConfig(dir: string, config: Record<string, any>): void {
  fs.writeFileSync(
    path.join(dir, "openlens.json"),
    JSON.stringify(config, null, 2) + "\n"
  )
}

/**
 * Write an agent markdown file.
 */
export function writeAgent(dir: string, name: string, content: string): void {
  const agentsDir = path.join(dir, "agents")
  fs.mkdirSync(agentsDir, { recursive: true })
  fs.writeFileSync(path.join(agentsDir, `${name}.md`), content)
}

/**
 * Remove a temporary directory.
 */
export function cleanup(dir: string): void {
  try {
    fs.rmSync(dir, { recursive: true, force: true })
  } catch {
    // Best effort
  }
}
