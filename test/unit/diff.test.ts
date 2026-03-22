import { describe, test, expect } from "bun:test"
import { getDiffStats } from "../../src/tool/diff.js"

const SAMPLE_DIFF = `diff --git a/src/auth.ts b/src/auth.ts
index 1234567..abcdefg 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -10,3 +10,5 @@ function login(user: string) {
-  const token = oldMethod(user)
+  const token = newMethod(user)
+  log(token)
 }
diff --git a/src/utils.ts b/src/utils.ts
index 2345678..bcdefgh 100644
--- a/src/utils.ts
+++ b/src/utils.ts
@@ -1,2 +1,3 @@
-export function old() {}
+export function newUtil() {}
+export function another() {}
`

describe("getDiffStats", () => {
  test("parses files from diff --git lines", () => {
    const stats = getDiffStats(SAMPLE_DIFF)
    expect(stats.files).toEqual(["src/auth.ts", "src/utils.ts"])
    expect(stats.filesChanged).toBe(2)
  })

  test("counts insertions (+ lines, excluding +++)", () => {
    const stats = getDiffStats(SAMPLE_DIFF)
    // +  const token = newMethod(user)
    // +  log(token)
    // +export function newUtil() {}
    // +export function another() {}
    expect(stats.insertions).toBe(4)
  })

  test("counts deletions (- lines, excluding ---)", () => {
    const stats = getDiffStats(SAMPLE_DIFF)
    // -  const token = oldMethod(user)
    // -export function old() {}
    expect(stats.deletions).toBe(2)
  })

  test("handles empty diff", () => {
    const stats = getDiffStats("")
    expect(stats.filesChanged).toBe(0)
    expect(stats.insertions).toBe(0)
    expect(stats.deletions).toBe(0)
    expect(stats.files).toEqual([])
  })

  test("handles diff with only additions", () => {
    const diff = `diff --git a/new.ts b/new.ts
--- /dev/null
+++ b/new.ts
@@ -0,0 +1,3 @@
+line 1
+line 2
+line 3
`
    const stats = getDiffStats(diff)
    expect(stats.filesChanged).toBe(1)
    expect(stats.insertions).toBe(3)
    expect(stats.deletions).toBe(0)
  })

  test("handles diff with only deletions", () => {
    const diff = `diff --git a/removed.ts b/removed.ts
--- a/removed.ts
+++ /dev/null
@@ -1,2 +0,0 @@
-line 1
-line 2
`
    const stats = getDiffStats(diff)
    expect(stats.filesChanged).toBe(1)
    expect(stats.insertions).toBe(0)
    expect(stats.deletions).toBe(2)
  })
})
