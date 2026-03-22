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

  test("handles renamed files", () => {
    const diff = `diff --git a/old-name.ts b/new-name.ts
similarity index 95%
rename from old-name.ts
rename to new-name.ts
--- a/old-name.ts
+++ b/new-name.ts
@@ -1,2 +1,2 @@
-const x = 1
+const x = 2
`
    const stats = getDiffStats(diff)
    expect(stats.filesChanged).toBe(1)
    expect(stats.files).toEqual(["new-name.ts"])
    expect(stats.insertions).toBe(1)
    expect(stats.deletions).toBe(1)
  })

  test("handles binary file diffs", () => {
    const diff = `diff --git a/image.png b/image.png
new file mode 100644
index 0000000..abcdef1
Binary files /dev/null and b/image.png differ
`
    const stats = getDiffStats(diff)
    expect(stats.filesChanged).toBe(1)
    expect(stats.files).toEqual(["image.png"])
    // Binary files have no +/- lines
    expect(stats.insertions).toBe(0)
    expect(stats.deletions).toBe(0)
  })

  test("handles mode change only", () => {
    const diff = `diff --git a/script.sh b/script.sh
old mode 100644
new mode 100755
`
    const stats = getDiffStats(diff)
    expect(stats.filesChanged).toBe(1)
    expect(stats.files).toEqual(["script.sh"])
    expect(stats.insertions).toBe(0)
    expect(stats.deletions).toBe(0)
  })

  test("handles files with spaces in path", () => {
    const diff = `diff --git a/my file.ts b/my file.ts
--- a/my file.ts
+++ b/my file.ts
@@ -1 +1 @@
-old
+new
`
    const stats = getDiffStats(diff)
    expect(stats.files).toEqual(["my file.ts"])
  })

  test("handles many files", () => {
    const files = Array.from({ length: 50 }, (_, i) => `file${i}.ts`)
    const diff = files
      .map(
        (f) => `diff --git a/${f} b/${f}
--- a/${f}
+++ b/${f}
@@ -1 +1 @@
-old
+new`
      )
      .join("\n")
    const stats = getDiffStats(diff)
    expect(stats.filesChanged).toBe(50)
    expect(stats.insertions).toBe(50)
    expect(stats.deletions).toBe(50)
  })
})
