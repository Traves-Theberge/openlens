import { describe, test, expect } from "bun:test"
import { capitalize, slugify, truncate } from "../../src/utils/string.js"

describe("capitalize", () => {
  test("capitalizes first letter and lowercases the rest", () => {
    expect(capitalize("hello world")).toBe("Hello world")
    expect(capitalize("HELLO WORLD")).toBe("Hello world")
    expect(capitalize("hELLO wORLD")).toBe("Hello world")
  })

  test("handles single character strings", () => {
    expect(capitalize("a")).toBe("A")
    expect(capitalize("Z")).toBe("Z")
    expect(capitalize("1")).toBe("1")
  })

  test("handles empty and invalid inputs", () => {
    expect(capitalize("")).toBe("")
    expect(capitalize("   ")).toBe("   ")
  })

  test("handles special characters and numbers", () => {
    expect(capitalize("123abc")).toBe("123abc")
    expect(capitalize("@hello")).toBe("@hello")
    expect(capitalize("!WORLD")).toBe("!world")
  })

  test("handles unicode characters", () => {
    expect(capitalize("ñoño")).toBe("Ñoño")
    expect(capitalize("CAFÉ")).toBe("Café")
  })
})

describe("slugify", () => {
  test("converts strings to lowercase slug format", () => {
    expect(slugify("Hello World")).toBe("hello-world")
    expect(slugify("HELLO WORLD")).toBe("hello-world")
    expect(slugify("Mixed Case String")).toBe("mixed-case-string")
  })

  test("handles special characters", () => {
    expect(slugify("Hello, World!")).toBe("hello-world")
    expect(slugify("Test@Email.com")).toBe("test-email-com")
    expect(slugify("Price: $19.99")).toBe("price-19-99")
  })

  test("handles multiple consecutive special characters", () => {
    expect(slugify("Hello!!!World")).toBe("hello-world")
    expect(slugify("Test---String")).toBe("test-string")
    expect(slugify("   Multiple   Spaces   ")).toBe("multiple-spaces")
  })

  test("removes leading and trailing special characters", () => {
    expect(slugify("!Hello World!")).toBe("hello-world")
    expect(slugify("---test---")).toBe("test")
    expect(slugify("   surrounded   ")).toBe("surrounded")
  })

  test("handles accented characters", () => {
    expect(slugify("Café")).toBe("cafe")
    expect(slugify("Niño")).toBe("nino")
    expect(slugify("Résumé")).toBe("resume")
    expect(slugify("Naïve")).toBe("naive")
  })

  test("handles empty and invalid inputs", () => {
    expect(slugify("")).toBe("")
    expect(slugify("   ")).toBe("")
    expect(slugify("!!!")).toBe("")
  })

  test("preserves numbers", () => {
    expect(slugify("Test 123")).toBe("test-123")
    expect(slugify("Version 2.0")).toBe("version-2-0")
  })

  test("handles complex mixed content", () => {
    expect(slugify("The Quick Brown Fox Jumps Over the Lazy Dog")).toBe("the-quick-brown-fox-jumps-over-the-lazy-dog")
    expect(slugify("API v2.1: User Authentication & Token Management")).toBe("api-v2-1-user-authentication-token-management")
  })
})

describe("truncate", () => {
  test("truncates long strings with ellipsis by default", () => {
    expect(truncate("Hello, World!", 10)).toBe("Hello, ...")
    expect(truncate("This is a very long string", 15)).toBe("This is a ve...")
  })

  test("does not truncate short strings", () => {
    expect(truncate("Short", 10)).toBe("Short")
    expect(truncate("Exact", 5)).toBe("Exact")
  })

  test("handles ellipsis parameter", () => {
    expect(truncate("Hello, World!", 10, true)).toBe("Hello, ...")
    expect(truncate("Hello, World!", 10, false)).toBe("Hello, Wor")
  })

  test("handles edge cases with length", () => {
    expect(truncate("Hello", 0)).toBe("")
    expect(truncate("Hello", -1)).toBe("")
    expect(truncate("Hello", 1, true)).toBe("H")
    expect(truncate("Hello", 2, true)).toBe("He")
    expect(truncate("Hello", 3, true)).toBe("Hel")
  })

  test("handles small lengths with ellipsis", () => {
    // When length is too small for meaningful ellipsis, just truncate
    expect(truncate("Hello World", 1, true)).toBe("H")
    expect(truncate("Hello World", 2, true)).toBe("He")
    expect(truncate("Hello World", 3, true)).toBe("Hel")
    expect(truncate("Hello World", 4, true)).toBe("H...")
  })

  test("handles empty and invalid inputs", () => {
    expect(truncate("", 10)).toBe("")
    expect(truncate("", 0)).toBe("")
  })

  test("preserves string when length equals string length", () => {
    const str = "Exactly"
    expect(truncate(str, str.length)).toBe(str)
    expect(truncate(str, str.length + 1)).toBe(str)
  })

  test("handles unicode characters correctly", () => {
    expect(truncate("Café München", 8)).toBe("Café ...")
    expect(truncate("🚀 Rocket", 6)).toBe("🚀 ...")
  })

  test("handles very long strings", () => {
    const longString = "a".repeat(1000)
    const truncated = truncate(longString, 50)
    expect(truncated.length).toBe(50)
    expect(truncated.endsWith("...")).toBe(true)
  })
})