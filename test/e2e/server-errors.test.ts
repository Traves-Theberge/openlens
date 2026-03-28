import { describe, test, expect, afterEach } from "bun:test"
import { spawn, spawnSync, type ChildProcess } from "child_process"
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
  port: number,
  extraArgs: string[] = []
): Promise<{ proc: ChildProcess; url: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(
      "bun",
      ["run", CLI_PATH, "serve", "--port", String(port), ...extraArgs],
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

const TIMEOUT = { timeout: 30_000 }

describe("server error handling", () => {
  test(
    "POST /review with empty body returns a result or graceful error",
    TIMEOUT,
    async () => {
      tmpDir = createTempGitRepo()
      writeConfig(tmpDir, {
        model: "opencode/big-pickle",
        server: { port: 14201, hostname: "localhost" },
      })

      const { proc, url } = await startServer(tmpDir, 14201)
      serverProc = proc

      const res = await fetch(`${url}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      })

      // Server should respond (not crash). It may succeed with a review result
      // or return an error status, but it must not hang or return a 5xx without a body.
      expect(res.status).toBeLessThan(600)
      const json = await res.json()
      expect(json).toBeDefined()
    }
  )

  test(
    "POST /review with invalid JSON body handles gracefully",
    TIMEOUT,
    async () => {
      tmpDir = createTempGitRepo()
      writeConfig(tmpDir, {
        model: "opencode/big-pickle",
        server: { port: 14202, hostname: "localhost" },
      })

      const { proc, url } = await startServer(tmpDir, 14202)
      serverProc = proc

      const res = await fetch(`${url}/review`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "this is not json{{{",
      })

      // The server catches JSON parse errors and falls back to an empty body,
      // so it should still return a response rather than crashing.
      expect(res.status).toBeLessThan(600)
      const json = await res.json()
      expect(json).toBeDefined()
    }
  )

  test(
    "GET /diff with invalid mode defaults to staged",
    TIMEOUT,
    async () => {
      tmpDir = createTempGitRepo()
      writeConfig(tmpDir, {
        model: "opencode/big-pickle",
        server: { port: 14203, hostname: "localhost" },
      })

      const { proc, url } = await startServer(tmpDir, 14203)
      serverProc = proc

      const res = await fetch(`${url}/diff?mode=bogus`)
      expect(res.status).toBe(200)

      const json = await res.json()
      // Invalid mode should fall back to "staged"
      expect(json.mode).toBe("staged")
      expect(json.stats).toBeDefined()
      expect(typeof json.stats.filesChanged).toBe("number")
    }
  )

  test(
    "GET /diff without mode parameter defaults to staged",
    TIMEOUT,
    async () => {
      tmpDir = createTempGitRepo()
      writeConfig(tmpDir, {
        model: "opencode/big-pickle",
        server: { port: 14204, hostname: "localhost" },
      })

      const { proc, url } = await startServer(tmpDir, 14204)
      serverProc = proc

      const res = await fetch(`${url}/diff`)
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json.mode).toBe("staged")
      expect(json.stats).toBeDefined()
      expect(typeof json.stats.filesChanged).toBe("number")
    }
  )

  test(
    "GET to non-existent endpoint returns 404",
    TIMEOUT,
    async () => {
      tmpDir = createTempGitRepo()
      writeConfig(tmpDir, {
        model: "opencode/big-pickle",
        server: { port: 14205, hostname: "localhost" },
      })

      const { proc, url } = await startServer(tmpDir, 14205)
      serverProc = proc

      const res = await fetch(`${url}/does-not-exist`)
      expect(res.status).toBe(404)
    }
  )

  test(
    "serve --hostname flag is accepted",
    TIMEOUT,
    async () => {
      tmpDir = createTempGitRepo()
      writeConfig(tmpDir, {
        model: "opencode/big-pickle",
        server: { port: 14206, hostname: "localhost" },
      })

      // Start with explicit --hostname 127.0.0.1 to verify the flag works
      const { proc, url } = await startServer(tmpDir, 14206, [
        "--hostname",
        "127.0.0.1",
      ])
      serverProc = proc

      // The server should be reachable on 127.0.0.1
      const res = await fetch(`http://127.0.0.1:14206/health`)
      expect(res.status).toBe(200)

      const json = await res.json()
      expect(json.status).toBe("ok")
    }
  )
})
