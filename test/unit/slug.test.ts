import { describe, expect, test } from "bun:test";
import { slug } from "../../src/util/slug";

describe("slug", () => {
  test("converts basic string to slug", () => {
    expect(slug("Hello World")).toBe("hello-world");
  });

  test("handles already-valid slugs", () => {
    expect(slug("already-valid-slug")).toBe("already-valid-slug");
  });

  test("handles unicode characters with diacritics", () => {
    expect(slug("Héllo Wörld")).toBe("hello-world");
    expect(slug("café résumé")).toBe("cafe-resume");
    expect(slug("naïve über")).toBe("naive-uber");
  });

  test("collapses multiple spaces", () => {
    expect(slug("hello   world")).toBe("hello-world");
  });

  test("handles special characters", () => {
    expect(slug("hello! @world# $test")).toBe("hello-world-test");
    expect(slug("foo & bar | baz")).toBe("foo-bar-baz");
  });

  test("trims leading and trailing dashes", () => {
    expect(slug("--hello-world--")).toBe("hello-world");
    expect(slug("  hello world  ")).toBe("hello-world");
  });

  test("handles empty string", () => {
    expect(slug("")).toBe("");
  });

  test("handles string with only special characters", () => {
    expect(slug("!@#$%^&*()")).toBe("");
  });

  test("handles mixed case and numbers", () => {
    expect(slug("OpenLens v2.0 Release")).toBe("openlens-v2-0-release");
  });

  test("handles tabs and newlines", () => {
    expect(slug("hello\tworld\nfoo")).toBe("hello-world-foo");
  });

  describe("camelCase option", () => {
    test("splits simple camelCase", () => {
      expect(slug("myVariableName", { camelCase: true })).toBe(
        "my-variable-name",
      );
    });

    test("splits PascalCase", () => {
      expect(slug("MyVariableName", { camelCase: true })).toBe(
        "my-variable-name",
      );
    });

    test("splits uppercase acronyms followed by lowercase", () => {
      expect(slug("XMLParser", { camelCase: true })).toBe("xml-parser");
      expect(slug("getHTTPResponse", { camelCase: true })).toBe(
        "get-http-response",
      );
    });

    test("handles single word", () => {
      expect(slug("hello", { camelCase: true })).toBe("hello");
      expect(slug("Hello", { camelCase: true })).toBe("hello");
    });

    test("handles camelCase with numbers", () => {
      expect(slug("version2Release", { camelCase: true })).toBe(
        "version2-release",
      );
      expect(slug("v2Release", { camelCase: true })).toBe("v2-release");
    });

    test("does not split when camelCase option is false or omitted", () => {
      expect(slug("myVariableName")).toBe("myvariablename");
      expect(slug("myVariableName", { camelCase: false })).toBe(
        "myvariablename",
      );
    });

    test("handles mixed camelCase and spaces", () => {
      expect(slug("myVariable Name here", { camelCase: true })).toBe(
        "my-variable-name-here",
      );
    });
  });
});
