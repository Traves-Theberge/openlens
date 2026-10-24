import { describe, expect, test } from "bun:test";
import { slug } from "../../src/util/slug";

describe("slug", () => {
  test("converts basic string", () => {
    expect(slug("Hello World")).toBe("hello-world");
  });

  test("handles multiple spaces", () => {
    expect(slug("hello   world")).toBe("hello-world");
  });

  test("handles special characters", () => {
    expect(slug("hello!@#$%world")).toBe("hello-world");
  });

  test("strips leading and trailing dashes", () => {
    expect(slug("--hello-world--")).toBe("hello-world");
    expect(slug("  hello world  ")).toBe("hello-world");
  });

  test("handles unicode / diacritics", () => {
    expect(slug("café résumé")).toBe("cafe-resume");
    expect(slug("über cool")).toBe("uber-cool");
    expect(slug("naïve señor")).toBe("naive-senor");
  });

  test("handles empty string", () => {
    expect(slug("")).toBe("");
  });

  test("returns already-valid slug unchanged", () => {
    expect(slug("already-valid-slug")).toBe("already-valid-slug");
  });

  test("handles camelCase", () => {
    expect(slug("myVariableName")).toBe("my-variable-name");
    expect(slug("innerHTML")).toBe("inner-html");
    expect(slug("getHTTPResponse")).toBe("get-http-response");
  });

  test("handles PascalCase", () => {
    expect(slug("FooBarBaz")).toBe("foo-bar-baz");
    expect(slug("MyComponent")).toBe("my-component");
  });

  test("handles numbers", () => {
    expect(slug("version 2.0.1")).toBe("version-2-0-1");
  });

  test("collapses consecutive special characters", () => {
    expect(slug("a---b___c...d")).toBe("a-b-c-d");
  });
});
