import { describe, test, expect, afterEach } from "bun:test"
import fs from "fs"
import path from "path"
import { spawnSync } from "child_process"
import {
  createTempGitRepo,
  cleanup,
  writeConfig,
  addStagedFile,
} from "./helpers"

let tmpDir: string

afterEach(() => {
  if (tmpDir) cleanup(tmpDir)
})

const LIB_PATH = path.resolve(__dirname, "../../src/lib.ts")

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

describe("library API: loadConfig", () => {
  test("loadConfig returns config with model and defaults", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      agent: {
        test: { description: "Test", prompt: "Reviewer." },
      },
    })

    const result = runScript(
      tmpDir,
      `
const config = await openlens.loadConfig("${tmpDir}");
console.log(JSON.stringify({
  model: config.model,
  hasReview: !!config.review,
  hasSuppress: !!config.suppress,
}));
`
    )

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout.trim())
    expect(output.model).toBe("opencode/big-pickle")
    expect(output.hasReview).toBe(true)
    expect(output.hasSuppress).toBe(true)
  })

  test("loadConfig returns defaults when no config file exists", () => {
    tmpDir = createTempGitRepo()

    const result = runScript(
      tmpDir,
      `
const config = await openlens.loadConfig("${tmpDir}");
console.log(JSON.stringify({
  hasModel: typeof config.model === "string",
  hasReview: !!config.review,
}));
`
    )

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout.trim())
    expect(output.hasModel).toBe(true)
    expect(output.hasReview).toBe(true)
  })
})

describe("library API: loadAgents", () => {
  test("loadAgents returns agent list from config", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      agent: {
        security: { description: "Scanner", prompt: "Security reviewer." },
        bugs: { description: "Detector", prompt: "Bug detector." },
      },
      disabled_agents: ["performance", "style"],
    })

    const result = runScript(
      tmpDir,
      `
const config = await openlens.loadConfig("${tmpDir}");
const agents = await openlens.loadAgents(config, "${tmpDir}");
console.log(JSON.stringify(agents.map(a => ({ name: a.name, desc: a.description }))));
`
    )

    expect(result.exitCode).toBe(0)
    const agents = JSON.parse(result.stdout.trim())
    expect(agents.length).toBeGreaterThanOrEqual(2)
    const names = agents.map((a: any) => a.name)
    expect(names).toContain("security")
    expect(names).toContain("bugs")
  })

  test("filterAgents filters config by agent name", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      agent: {
        security: { description: "Scanner", prompt: "Security reviewer." },
        bugs: { description: "Detector", prompt: "Bug detector." },
      },
      disabled_agents: ["performance", "style"],
    })

    const result = runScript(
      tmpDir,
      `
const config = await openlens.loadConfig("${tmpDir}");
const filtered = openlens.filterAgents(config, "security");
const agents = await openlens.loadAgents(filtered, "${tmpDir}");
console.log(JSON.stringify(agents.map(a => a.name)));
`
    )

    expect(result.exitCode).toBe(0)
    const names = JSON.parse(result.stdout.trim())
    expect(names).toEqual(["security"])
  })

  test("excludeAgents removes agents by name", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      agent: {
        security: { description: "Scanner", prompt: "Security reviewer." },
        bugs: { description: "Detector", prompt: "Bug detector." },
      },
      disabled_agents: ["performance", "style"],
    })

    const result = runScript(
      tmpDir,
      `
const config = await openlens.loadConfig("${tmpDir}");
const excluded = openlens.excludeAgents(config, "security");
const agents = await openlens.loadAgents(excluded, "${tmpDir}");
console.log(JSON.stringify(agents.map(a => a.name)));
`
    )

    expect(result.exitCode).toBe(0)
    const names = JSON.parse(result.stdout.trim())
    expect(names).not.toContain("security")
    expect(names).toContain("bugs")
  })
})

describe("library API: getDiff and getDiffStats", () => {
  test("getDiff returns staged diff", () => {
    tmpDir = createTempGitRepo()
    addStagedFile(tmpDir, "src/app.ts", "export const greeting = 'hello'\n")

    const result = runScript(
      tmpDir,
      `
process.chdir("${tmpDir}");
const diff = await openlens.getDiff("staged");
console.log(JSON.stringify({ hasDiff: diff.length > 0, containsFile: diff.includes("src/app.ts") }));
`
    )

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout.trim())
    expect(output.hasDiff).toBe(true)
    expect(output.containsFile).toBe(true)
  })

  test("getDiffStats parses diff correctly", () => {
    tmpDir = createTempGitRepo()
    addStagedFile(tmpDir, "src/a.ts", "const a = 1\nconst b = 2\n")
    addStagedFile(tmpDir, "src/b.ts", "const c = 3\n")

    const result = runScript(
      tmpDir,
      `
process.chdir("${tmpDir}");
const diff = await openlens.getDiff("staged");
const stats = openlens.getDiffStats(diff);
console.log(JSON.stringify(stats));
`
    )

    expect(result.exitCode).toBe(0)
    const stats = JSON.parse(result.stdout.trim())
    expect(stats.filesChanged).toBe(2)
    expect(stats.insertions).toBeGreaterThan(0)
    expect(stats.files).toContain("src/a.ts")
    expect(stats.files).toContain("src/b.ts")
  })

  test("getDiff with empty staging area returns empty string", () => {
    tmpDir = createTempGitRepo()

    const result = runScript(
      tmpDir,
      `
process.chdir("${tmpDir}");
const diff = await openlens.getDiff("staged");
console.log(JSON.stringify({ isEmpty: diff.length === 0 }));
`
    )

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout.trim())
    expect(output.isEmpty).toBe(true)
  })
})

describe("library API: formatters", () => {
  test("formatJson produces valid JSON output", () => {
    tmpDir = createTempGitRepo()

    const result = runScript(
      tmpDir,
      `
const output = openlens.formatJson({ issues: [], timing: { total: 100, agents: {} }, meta: { mode: "staged", filesChanged: 0, agentsRun: 0, suppressed: 0, verified: false } });
const parsed = JSON.parse(output);
console.log(JSON.stringify({ valid: !!parsed.issues, hasMeta: !!parsed.meta }));
`
    )

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout.trim())
    expect(output.valid).toBe(true)
    expect(output.hasMeta).toBe(true)
  })

  test("formatSarif produces SARIF 2.1.0 output", () => {
    tmpDir = createTempGitRepo()

    const result = runScript(
      tmpDir,
      `
const output = openlens.formatSarif({ issues: [], timing: { total: 0, agents: {} }, meta: { mode: "staged", filesChanged: 0, agentsRun: 0, suppressed: 0, verified: false } });
const sarif = JSON.parse(output);
console.log(JSON.stringify({ version: sarif.version, hasRuns: Array.isArray(sarif.runs) }));
`
    )

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout.trim())
    expect(output.version).toBe("2.1.0")
    expect(output.hasRuns).toBe(true)
  })

  test("formatMarkdown produces markdown with review marker", () => {
    tmpDir = createTempGitRepo()

    const result = runScript(
      tmpDir,
      `
const output = openlens.formatMarkdown({ issues: [], timing: { total: 0, agents: {} }, meta: { mode: "staged", filesChanged: 0, agentsRun: 0, suppressed: 0, verified: false } });
console.log(JSON.stringify({ hasMarker: output.includes("<!-- openlens-review -->") }));
`
    )

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout.trim())
    expect(output.hasMarker).toBe(true)
  })
})

describe("library API: suppression", () => {
  test("loadSuppressRules loads from config and .openlensignore", () => {
    tmpDir = createTempGitRepo()
    writeConfig(tmpDir, {
      model: "opencode/big-pickle",
      suppress: { files: ["vendor/**"], patterns: ["TODO"] },
    })
    fs.writeFileSync(
      path.join(tmpDir, ".openlensignore"),
      "dist/**\ngenerated/**\n"
    )

    const result = runScript(
      tmpDir,
      `
const config = await openlens.loadConfig("${tmpDir}");
const rules = await openlens.loadSuppressRules(config, "${tmpDir}");
console.log(JSON.stringify({
  count: rules.length,
  types: [...new Set(rules.map(r => r.type))],
}));
`
    )

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout.trim())
    // vendor/**, TODO (pattern), dist/**, generated/** = at least 4 rules
    expect(output.count).toBeGreaterThanOrEqual(4)
    expect(output.types).toContain("file")
    expect(output.types).toContain("pattern")
  })

  test("shouldSuppress correctly matches file patterns", () => {
    tmpDir = createTempGitRepo()

    const result = runScript(
      tmpDir,
      `
const rules = [{ type: "file" as const, value: "vendor/**" }];
const issue = { file: "vendor/lib/foo.js", title: "Test", message: "msg", severity: "warning" as const, confidence: "high" as const, line: 1, agent: "test" };
const suppressed = openlens.shouldSuppress(issue as any, rules);
console.log(JSON.stringify({ suppressed }));
`
    )

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout.trim())
    expect(output.suppressed).toBe(true)
  })
})

describe("library API: rules discovery", () => {
  test("discoverRules finds CLAUDE.md", () => {
    tmpDir = createTempGitRepo()
    fs.writeFileSync(
      path.join(tmpDir, "CLAUDE.md"),
      "# Rules\nAlways check for SQL injection.\n"
    )

    const result = runScript(
      tmpDir,
      `
const rules = await openlens.discoverRules("${tmpDir}");
console.log(JSON.stringify({
  count: rules.length,
  files: rules.map(r => r.relativePath),
}));
`
    )

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout.trim())
    expect(output.count).toBeGreaterThanOrEqual(1)
    expect(output.files.some((f: string) => f.includes("CLAUDE.md"))).toBe(true)
  })

  test("formatDiscoveredRules produces markdown", () => {
    tmpDir = createTempGitRepo()
    fs.writeFileSync(path.join(tmpDir, "CLAUDE.md"), "# Rules\nSome rules.\n")

    const result = runScript(
      tmpDir,
      `
const rules = await openlens.discoverRules("${tmpDir}");
const formatted = openlens.formatDiscoveredRules(rules);
console.log(JSON.stringify({ hasContent: formatted.length > 0, hasFrom: formatted.includes("From:") }));
`
    )

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout.trim())
    expect(output.hasContent).toBe(true)
    expect(output.hasFrom).toBe(true)
  })
})

describe("library API: event bus", () => {
  test("createBus creates a working event emitter", () => {
    tmpDir = createTempGitRepo()

    const result = runScript(
      tmpDir,
      `
type Events = { "test.event": { value: number } };
const bus = openlens.createBus<Events>();
let received: any = null;
bus.subscribe("test.event", (data: any) => { received = data; });
bus.publish("test.event", { value: 42 });
console.log(JSON.stringify({ received }));
`
    )

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout.trim())
    expect(output.received).toEqual({ value: 42 })
  })
})

describe("library API: CI detection", () => {
  test("detectCI returns isCI: false outside CI", () => {
    tmpDir = createTempGitRepo()

    const result = runScript(
      tmpDir,
      `
const ci = openlens.detectCI();
console.log(JSON.stringify(ci));
`,
      { CI: "", GITHUB_ACTIONS: "", GITLAB_CI: "" }
    )

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout.trim())
    expect(output.isCI).toBe(false)
  })

  test("detectCI detects GitHub Actions", () => {
    tmpDir = createTempGitRepo()

    const result = runScript(
      tmpDir,
      `
const ci = openlens.detectCI();
console.log(JSON.stringify(ci));
`,
      { CI: "true", GITHUB_ACTIONS: "true" }
    )

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout.trim())
    expect(output.isCI).toBe(true)
    expect(output.provider).toBe("github")
  })

  test("inferBaseBranch reads GITHUB_BASE_REF", () => {
    tmpDir = createTempGitRepo()

    const result = runScript(
      tmpDir,
      `
const branch = openlens.inferBaseBranch();
console.log(JSON.stringify({ branch }));
`,
      { GITHUB_BASE_REF: "develop" }
    )

    expect(result.exitCode).toBe(0)
    const output = JSON.parse(result.stdout.trim())
    expect(output.branch).toBe("develop")
  })
})
