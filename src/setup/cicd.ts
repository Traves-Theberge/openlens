import * as p from "@clack/prompts"
import fs from "fs/promises"
import path from "path"
import { spawnSync } from "child_process"
import type { SetupOptions } from "./index.js"

function detectRepoHost(
  cwd: string,
): "github" | "gitlab" | "unknown" {
  const result = spawnSync("git", ["remote", "get-url", "origin"], {
    cwd,
    encoding: "utf-8",
  })
  const url = result.stdout?.trim() || ""
  if (url.includes("github.com")) return "github"
  if (url.includes("gitlab.com") || url.includes("gitlab")) return "gitlab"
  return "unknown"
}

const GITHUB_WORKFLOW = (options: {
  inlineComments: boolean
  uploadSarif: boolean
  failOnCritical: boolean
}) => `name: OpenLens Code Review

on:
  pull_request:
    types: [opened, synchronize, reopened]

permissions:
  contents: read
  pull-requests: write${options.uploadSarif ? "\n  security-events: write" : ""}

jobs:
  review:
    name: Code Review
    runs-on: ubuntu-latest

    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - name: Fetch base branch
        run: git fetch origin \${{ github.base_ref }}:\${{ github.base_ref }}

      - uses: Traves-Theberge/OpenLens@main
        with:
          mode: branch
          base-branch: \${{ github.base_ref }}
          comment-on-pr: "true"
          inline-comments: "${options.inlineComments}"
          auto-resolve: "true"
          upload-sarif: "${options.uploadSarif}"
          fail-on-critical: "${options.failOnCritical}"
`

const GITLAB_CI = () => `openlens-review:
  stage: test
  image: oven/bun:latest
  script:
    - npm install -g openlens
    - openlens run --branch \$CI_MERGE_REQUEST_TARGET_BRANCH_NAME --format text
  rules:
    - if: \$CI_MERGE_REQUEST_ID
`

export async function setupCICD(cwd: string, options: SetupOptions) {
  p.log.step("CI/CD")

  const host = detectRepoHost(cwd)

  if (host === "unknown" && !options.yes) {
    const choice = await p.select({
      message: "Could not detect repo host. What CI system do you use?",
      options: [
        { value: "github", label: "GitHub Actions" },
        { value: "gitlab", label: "GitLab CI" },
        { value: "skip", label: "Skip CI setup" },
      ],
    })
    if (p.isCancel(choice)) {
      p.cancel("Setup cancelled.")
      process.exit(0)
    }
    if (choice === "skip") return
    return generateWorkflow(cwd, choice as "github" | "gitlab", options)
  }

  if (host === "unknown") return

  p.log.info(`Detected: ${host === "github" ? "GitHub" : "GitLab"}`)
  return generateWorkflow(cwd, host, options)
}

async function generateWorkflow(
  cwd: string,
  host: "github" | "gitlab",
  options: SetupOptions,
) {
  if (host === "github") {
    const workflowDir = path.join(cwd, ".github", "workflows")
    const workflowPath = path.join(workflowDir, "openlens-review.yml")

    try {
      await fs.access(workflowPath)
      if (!options.yes) {
        const overwrite = (await p.confirm({
          message: "openlens-review.yml already exists. Overwrite?",
          initialValue: false,
        })) as boolean
        if (p.isCancel(overwrite)) {
          p.cancel("Setup cancelled.")
          process.exit(0)
        }
        if (!overwrite) {
          p.log.info("Keeping existing workflow.")
          return
        }
      }
    } catch {}

    let inlineComments = true
    let uploadSarif = true
    let failOnCritical = true

    if (!options.yes) {
      inlineComments = (await p.confirm({
        message: "Post inline comments on PR lines?",
        initialValue: true,
      })) as boolean
      if (p.isCancel(inlineComments)) {
        p.cancel("Setup cancelled.")
        process.exit(0)
      }

      uploadSarif = (await p.confirm({
        message: "Upload SARIF to Code Scanning?",
        initialValue: true,
      })) as boolean
      if (p.isCancel(uploadSarif)) {
        p.cancel("Setup cancelled.")
        process.exit(0)
      }

      failOnCritical = (await p.confirm({
        message: "Fail workflow on critical issues?",
        initialValue: true,
      })) as boolean
      if (p.isCancel(failOnCritical)) {
        p.cancel("Setup cancelled.")
        process.exit(0)
      }
    }

    await fs.mkdir(workflowDir, { recursive: true })
    await fs.writeFile(
      workflowPath,
      GITHUB_WORKFLOW({ inlineComments, uploadSarif, failOnCritical }),
    )
    p.log.success("Created .github/workflows/openlens-review.yml")
  } else if (host === "gitlab") {
    const ciPath = path.join(cwd, ".gitlab-ci.yml")
    let content = ""

    try {
      content = await fs.readFile(ciPath, "utf-8")
      if (content.includes("openlens")) {
        p.log.info("OpenLens already in .gitlab-ci.yml")
        return
      }
      // Append to existing
      content += "\n" + GITLAB_CI()
    } catch {
      content = GITLAB_CI()
    }

    await fs.writeFile(ciPath, content)
    p.log.success("Added OpenLens stage to .gitlab-ci.yml")
  }
}
