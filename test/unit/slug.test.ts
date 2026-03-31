import { describe, expect, test } from "bun:test";
import { slug } from "../../src/util/slug";

describe("slug", () => {
  test("converts basic string to slug", () => {
    expect(slug("Hello World")).toBe("hello-world");
  });

  test("handles multiple spaces", () => {
    expect(slug("hello   world   foo")).toBe("hello-world-foo");
  });

  test("handles special characters", () => {
    expect(slug("hello@world! #foo")).toBe("hello-world-foo");
  });

  test("handles unicode characters with diacritics", () => {
    expect(slug("café résumé")).toBe("cafe-resume");
  });

  test("handles other unicode characters", () => {
    expect(slug("über straße")).toBe("uber-stra-e");
  });

  test("trims leading and trailing dashes", () => {
    expect(slug("--hello-world--")).toBe("hello-world");
  });

  test("trims dashes produced from leading/trailing special chars", () => {
    expect(slug("!!!hello!!!")).toBe("hello");
  });

  test("returns empty string for empty input", () => {
    expect(slug("")).toBe("");
  });

  test("returns empty string for only special characters", () => {
    expect(slug("@#$%^&*")).toBe("");
  });

  test("passes through already-valid slugs unchanged", () => {
    expect(slug("already-valid-slug")).toBe("already-valid-slug");
  });

  test("handles mixed case", () => {
    expect(slug("FooBarBAZ")).toBe("foo-bar-baz");
  });

  test("splits camelCase input", () => {
    expect(slug("myVariableName")).toBe("my-variable-name");
  });

  test("splits PascalCase input", () => {
    expect(slug("MyVariableName")).toBe("my-variable-name");
  });

  test("splits acronym followed by word", () => {
    expect(slug("parseHTMLDocument")).toBe("parse-html-document");
  });

  test("splits consecutive uppercase with trailing lowercase", () => {
    expect(slug("XMLHttpRequest")).toBe("xml-http-request");
  });

  test("handles camelCase with numbers", () => {
    expect(slug("getV2ApiResponse")).toBe("get-v2-api-response");
  });

  test("handles numbers", () => {
    expect(slug("version 2.0.1 release")).toBe("version-2-0-1-release");
  });

  test("handles tabs and newlines", () => {
    expect(slug("hello\tworld\nfoo")).toBe("hello-world-foo");
  });
});
