import { describe, test, expect, afterEach } from "bun:test"
import { spawn, type ChildProcess } from "child_process"
import fs from "fs"
import path from "path"
import { createTempGitRepo, cleanup, writeConfig } from "./helpers"

let tmpDir: string
let serverProc: ChildProcess | null = null

afterEach(() => {
  if (serverProc) {
    serverProc.kill()
    serverProc = null
  }
  if (tmpDir) cleanup(tmpDir)
})

const CLI_PATH = path.resolve(__dirname, "../../src/index.ts")

function startServer(
  cwd: string,
  port: number
): Promise<{ proc: ChildProcess; url: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "bun",
      ["run", CLI_PATH, "serve", "--port", String(port)],
      {
        cwd,
        env: { ...process.env, NO_COLOR: "1" },
        stdio: ["ignore", "pipe", "pipe"],
      }
    )

    const timeout = setTimeout(() => {
      proc.kill()
      reject(new Error("Server did not start within 15s"))
    }, 15_000)

    let output = ""
    proc.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString()
      if (output.includes("listening")) {
        clearTimeout(timeout)
        // Give the server a moment to bind
        setTimeout(() => resolve({ proc, url: `http://localhost:${port}` }), 200)
      }
    })

    proc.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString()
    })

    proc.on("exit", (code) => {
      clearTimeout(timeout)
      reject(new Error(`Server exited with code ${code}: ${output}`))
    })

    proc.on("error", (err) => {
      clearTimeout(timeout)
      reject(err)
    })
  })
}

async function fetchJson(url: string, retries = 3): Promise<any> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url)
      return res.json()
    } catch {
      if (i < retries - 1) await new Promise((r) => setTimeout(r, 500))
    }
  }
  throw new Error(`Failed to fetch ${url} after ${retries} retries`)
}

const TIMEOUT = { timeout: 30_000 }

describe("openlens serve", () => {
  test("starts server and responds to /health", TIMEOUT, async () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "anthropic/claude-sonnet-4-20250514",
      server: { port: 14096, hostname: "localhost" },
    })

    const { proc, url } = await startServer(tmpDir, 14096)
    serverProc = proc

    const health = await fetchJson(`${url}/health`)
    expect(health.status).toBe("ok")
  })

  test("GET / returns version info", TIMEOUT, async () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "anthropic/claude-sonnet-4-20250514",
      server: { port: 14097, hostname: "localhost" },
    })

    const { proc, url } = await startServer(tmpDir, 14097)
    serverProc = proc

    const info = await fetchJson(`${url}/`)
    expect(info.name).toBe("openlens")
    expect(info.version).toBe("0.1.0")
  })

  test("GET /agents returns agent list", TIMEOUT, async () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "anthropic/claude-sonnet-4-20250514",
      agent: {
        security: { description: "Scanner", prompt: "You are a reviewer." },
      },
      server: { port: 14098, hostname: "localhost" },
    })

    const { proc, url } = await startServer(tmpDir, 14098)
    serverProc = proc

    const agents = await fetchJson(`${url}/agents`)
    expect(Array.isArray(agents)).toBe(true)
    expect(agents.length).toBeGreaterThanOrEqual(1)
    // Find the security agent in the list (may include built-in defaults too)
    const security = agents.find((a: any) => a.name === "security")
    expect(security).toBeDefined()
    expect(security.permission).toBeDefined()
  })

  test("GET /config returns config", TIMEOUT, async () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      server: { port: 14099, hostname: "localhost" },
    })

    const { proc, url } = await startServer(tmpDir, 14099)
    serverProc = proc

    const config = await fetchJson(`${url}/config`)
    expect(config.model).toBe("opencode/big-pickle")
    expect(config.server).toBeDefined()
    expect(config.review).toBeDefined()
  })

  test("GET /diff returns diff stats", TIMEOUT, async () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "anthropic/claude-sonnet-4-20250514",
      server: { port: 14100, hostname: "localhost" },
    })

    const { proc, url } = await startServer(tmpDir, 14100)
    serverProc = proc

    const diff = await fetchJson(`${url}/diff?mode=staged`)
    expect(diff.mode).toBe("staged")
    expect(diff.stats).toBeDefined()
    expect(typeof diff.stats.filesChanged).toBe("number")
  })
})
