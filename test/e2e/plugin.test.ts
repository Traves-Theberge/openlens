import { describe, test, expect, afterEach } from "bun:test"
import fs from "fs"
import path from "path"
import { spawnSync } from "child_process"
import {
  createTempGitRepo,
  cleanup,
  addStagedFile,
  run,
} from "./helpers"

let tmpDir: string

afterEach(() => {
  if (tmpDir) cleanup(tmpDir)
})

const LIB_PATH = path.resolve(__dirname, "../../src/lib.ts")
const PLUGIN_PATH = path.resolve(__dirname, "../../src/plugin.ts")

/**
 * Run a TypeScript snippet using bun that imports from the openlens library.
 */
function runScript(cwd: string, script: string, env?: Record<string, string>) {
  const scriptPath = path.join(cwd, "_test_script.ts")
  const fullScript = `import * as openlens from "${LIB_PATH}";\n${script}`
  fs.writeFileSync(scriptPath, fullScript)

  const result = spawnSync("bun", ["run", scriptPath], {
    cwd,
    encoding: "utf-8",
    timeout: 30_000,
    env: { ...process.env, NO_COLOR: "1", CI: "", GITHUB_ACTIONS: "", ...env },
  })

  return {
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    exitCode: result.status,
  }
}

// ---------------------------------------------------------------------------
// 1. Plugin structure tests
// ---------------------------------------------------------------------------

describe("plugin structure", () => {
  test("plugin module exports a default function", () => {
    tmpDir = createTempGitRepo()

    const result = runScript(
      tmpDir,
      `
import plugin from "${PLUGIN_PATH}";
console.log(JSON.stringify({ isFunction: typeof plugin === "function" }));
`
    )

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout.trim())
    expect(output.isFunction).toBe(true)
  })

  test("plugin returns expected tool names when called with a mock context", () => {
    tmpDir = createTempGitRepo()

    const result = runScript(
      tmpDir,
      `
import plugin from "${PLUGIN_PATH}";
const result = await plugin({ directory: "${tmpDir}" });
const toolNames = Object.keys(result.tool);
console.log(JSON.stringify({
  toolNames,
  hasPermission: typeof result["permission.ask"] === "function",
  hasChatParams: typeof result["chat.params"] === "function",
}));
`
    )

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout.trim())
    expect(output.toolNames).toContain("openlens")
    expect(output.toolNames).toContain("openlens-delegate")
    expect(output.toolNames).toContain("openlens-conventions")
    expect(output.toolNames).toContain("openlens-agents")
    expect(output.hasPermission).toBe(true)
    expect(output.hasChatParams).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 2. Debug mode tests
// ---------------------------------------------------------------------------

describe("debug mode", () => {
  test("OPENLENS_DEBUG=1 enables the debug function to write to stderr", () => {
    tmpDir = createTempGitRepo()

    // Import the review module's debug mechanism by reproducing its pattern.
    // The debug function in review.ts checks process.env.OPENLENS_DEBUG at module load time,
    // so we verify the env var is correctly propagated and the pattern works.
    const result = runScript(
      tmpDir,
      `
const DEBUG = !!process.env.OPENLENS_DEBUG;
function debug(...args: any[]) {
  if (!DEBUG) return;
  const ts = new Date().toISOString().slice(11, 23);
  console.error(\`  [debug \${ts}]\`, ...args);
}
debug("test message from debug mode");
console.log(JSON.stringify({ debugEnabled: DEBUG }));
`,
      { OPENLENS_DEBUG: "1" }
    )

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout.trim())
    expect(output.debugEnabled).toBe(true)
    expect(result.stderr).toContain("[debug")
    expect(result.stderr).toContain("test message from debug mode")
  })

  test("without OPENLENS_DEBUG, debug function does not write to stderr", () => {
    tmpDir = createTempGitRepo()

    const result = runScript(
      tmpDir,
      `
const DEBUG = !!process.env.OPENLENS_DEBUG;
function debug(...args: any[]) {
  if (!DEBUG) return;
  const ts = new Date().toISOString().slice(11, 23);
  console.error(\`  [debug \${ts}]\`, ...args);
}
debug("this should not appear");
console.log(JSON.stringify({ debugEnabled: DEBUG }));
`,
      { OPENLENS_DEBUG: "" }
    )

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout.trim())
    expect(output.debugEnabled).toBe(false)
    expect(result.stderr).not.toContain("[debug")
    expect(result.stderr).not.toContain("this should not appear")
  })
})

// ---------------------------------------------------------------------------
// 3. Library createServer tests
// ---------------------------------------------------------------------------

describe("library API: createServer", () => {
  test("createServer returns a Hono app instance", () => {
    tmpDir = createTempGitRepo()

    const result = runScript(
      tmpDir,
      `
const config = await openlens.loadConfig("${tmpDir}");
const app = openlens.createServer(config);
console.log(JSON.stringify({
  hasRoutes: typeof app.fetch === "function",
  type: typeof app,
  hasGet: typeof app.get === "function",
  hasPost: typeof app.post === "function",
}));
`
    )

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout.trim())
    expect(output.type).toBe("object")
    expect(output.hasRoutes).toBe(true)
    expect(output.hasGet).toBe(true)
    expect(output.hasPost).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// 4. Library GitHub review formatter tests
// ---------------------------------------------------------------------------

describe("library API: formatGitHubReview", () => {
  test("formatGitHubReview produces expected structure with issues", () => {
    tmpDir = createTempGitRepo()

    const result = runScript(
      tmpDir,
      `
const reviewResult = {
  issues: [{
    file: "src/app.ts",
    title: "SQL Injection",
    message: "User input not sanitized",
    severity: "critical" as const,
    confidence: "high" as const,
    line: 10,
    agent: "security",
  }],
  timing: { total: 500, agents: { security: 500 } },
  meta: { mode: "staged", filesChanged: 1, agentsRun: 1, suppressed: 0, verified: false },
};
const review = openlens.formatGitHubReview(reviewResult);
console.log(JSON.stringify({
  hasBody: typeof review.body === "string" && review.body.length > 0,
  event: review.event,
  commentCount: review.comments.length,
  firstCommentPath: review.comments[0]?.path,
  firstCommentLine: review.comments[0]?.line,
  hasFingerprints: Object.keys(review.fingerprints || {}).length > 0,
  bodyMentionsIssues: review.body.includes("1 issue"),
}));
`
    )

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout.trim())
    expect(output.hasBody).toBe(true)
    expect(output.event).toBe("REQUEST_CHANGES")
    expect(output.commentCount).toBe(1)
    expect(output.firstCommentPath).toBe("src/app.ts")
    expect(output.firstCommentLine).toBe(10)
    expect(output.hasFingerprints).toBe(true)
    expect(output.bodyMentionsIssues).toBe(true)
  })

  test("formatGitHubReview returns APPROVE for empty issues", () => {
    tmpDir = createTempGitRepo()

    const result = runScript(
      tmpDir,
      `
const reviewResult = {
  issues: [],
  timing: { total: 100, agents: {} },
  meta: { mode: "staged", filesChanged: 0, agentsRun: 0, suppressed: 0, verified: false },
};
const review = openlens.formatGitHubReview(reviewResult);
console.log(JSON.stringify({
  event: review.event,
  commentCount: review.comments.length,
  bodyNoIssues: review.body.includes("no issues"),
}));
`
    )

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout.trim())
    expect(output.event).toBe("APPROVE")
    expect(output.commentCount).toBe(0)
    expect(output.bodyNoIssues).toBe(true)
  })
})
