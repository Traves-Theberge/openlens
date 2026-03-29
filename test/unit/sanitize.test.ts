import { describe, test, expect } from "bun:test"
import { trimWhitespace, escapeHtml, isValidEmail } from "../../src/sanitize.js"

describe("trimWhitespace", () => {
  test("trims leading and trailing whitespace", () => {
    expect(trimWhitespace("  hello  ")).toBe("hello")
  })

  test("collapses internal whitespace to single space", () => {
    expect(trimWhitespace("hello   world")).toBe("hello world")
  })

  test("handles tabs and newlines", () => {
    expect(trimWhitespace("\thello\n\nworld\t")).toBe("hello world")
  })

  test("returns empty string for whitespace-only input", () => {
    expect(trimWhitespace("   ")).toBe("")
  })

  test("leaves single-word strings unchanged", () => {
    expect(trimWhitespace("hello")).toBe("hello")
  })
})

describe("escapeHtml", () => {
  test("escapes ampersand", () => {
    expect(escapeHtml("a & b")).toBe("a &amp; b")
  })

  test("escapes angle brackets", () => {
    expect(escapeHtml("<script>")).toBe("&lt;script&gt;")
  })

  test("escapes quotes", () => {
    expect(escapeHtml(`"it's"`)).toBe("&quot;it&#39;s&quot;")
  })

  test("escapes all entities in a mixed string", () => {
    expect(escapeHtml(`<a href="x">&`)).toBe("&lt;a href=&quot;x&quot;&gt;&amp;")
  })

  test("returns plain text unchanged", () => {
    expect(escapeHtml("hello world")).toBe("hello world")
  })
})

describe("isValidEmail", () => {
  test("accepts standard email", () => {
    expect(isValidEmail("user@example.com")).toBe(true)
  })

  test("accepts email with subdomain", () => {
    expect(isValidEmail("user@mail.example.com")).toBe(true)
  })

  test("accepts email with plus addressing", () => {
    expect(isValidEmail("user+tag@example.com")).toBe(true)
  })

  test("rejects missing @", () => {
    expect(isValidEmail("userexample.com")).toBe(false)
  })

  test("rejects missing domain", () => {
    expect(isValidEmail("user@")).toBe(false)
  })

  test("rejects missing TLD", () => {
    expect(isValidEmail("user@example")).toBe(false)
  })

  test("rejects spaces", () => {
    expect(isValidEmail("user @example.com")).toBe(false)
  })

  test("rejects empty string", () => {
    expect(isValidEmail("")).toBe(false)
  })
})
