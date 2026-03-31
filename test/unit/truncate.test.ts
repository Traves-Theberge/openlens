import { describe, expect, test } from "bun:test";
import { truncate } from "../../src/util/truncate.js";

describe("truncate", () => {
  test("truncates a long string with default suffix", () => {
    expect(truncate("Hello, World!", 8)).toBe("Hello...");
  });

  test("returns string as-is when shorter than maxLength", () => {
    expect(truncate("Hi", 10)).toBe("Hi");
  });

  test("returns string as-is when exactly maxLength", () => {
    expect(truncate("Hello", 5)).toBe("Hello");
  });

  test("handles empty string", () => {
    expect(truncate("", 5)).toBe("");
  });

  test("uses custom suffix", () => {
    expect(truncate("Hello, World!", 7, "…")).toBe("Hello,…");
  });

  test("uses empty suffix", () => {
    expect(truncate("Hello, World!", 5, "")).toBe("Hello");
  });

  test("handles suffix longer than maxLength", () => {
    expect(truncate("Hello, World!", 2, "...")).toBe("..");
  });

  test("handles maxLength of 0", () => {
    expect(truncate("Hello", 0)).toBe("");
  });

  test("handles multi-byte unicode (emoji)", () => {
    const emoji = "👋🌍🎉🚀🔥";
    expect(truncate(emoji, 4)).toBe("👋...");
  });

  test("handles CJK characters", () => {
    const cjk = "你好世界测试";
    expect(truncate(cjk, 5)).toBe("你好...");
  });

  test("does not split emoji codepoints", () => {
    const str = "A👋B";
    expect(truncate(str, 3)).toBe("A👋B");
  });
});
