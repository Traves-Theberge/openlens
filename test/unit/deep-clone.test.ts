import { describe, expect, test } from "bun:test";
import { deepClone } from "../../src/util/deep-clone";

describe("deepClone", () => {
  test("primitives are returned as-is", () => {
    expect(deepClone(42)).toBe(42);
    expect(deepClone("hello")).toBe("hello");
    expect(deepClone(true)).toBe(true);
    expect(deepClone(null)).toBe(null);
    expect(deepClone(undefined)).toBe(undefined);
  });

  test("plain objects are deeply cloned", () => {
    const obj = { a: 1, b: { c: 2 } };
    const clone = deepClone(obj);
    expect(clone).toEqual(obj);
    expect(clone).not.toBe(obj);
    expect(clone.b).not.toBe(obj.b);

    clone.b.c = 99;
    expect(obj.b.c).toBe(2);
  });

  test("arrays are deeply cloned", () => {
    const arr = [1, [2, 3], { x: 4 }];
    const clone = deepClone(arr);
    expect(clone).toEqual(arr);
    expect(clone).not.toBe(arr);
    expect(clone[1]).not.toBe(arr[1]);
    expect(clone[2]).not.toBe(arr[2]);
  });

  test("Date instances are cloned", () => {
    const date = new Date("2025-01-15T12:00:00Z");
    const clone = deepClone(date);
    expect(clone).toEqual(date);
    expect(clone).not.toBe(date);
    expect(clone.getTime()).toBe(date.getTime());
  });

  test("RegExp instances are cloned", () => {
    const regex = /foo/gi;
    const clone = deepClone(regex);
    expect(clone).not.toBe(regex);
    expect(clone.source).toBe("foo");
    expect(clone.flags).toBe("gi");
  });

  test("Map instances are deeply cloned", () => {
    const map = new Map<string, { v: number }>([
      ["a", { v: 1 }],
      ["b", { v: 2 }],
    ]);
    const clone = deepClone(map);
    expect(clone).not.toBe(map);
    expect(clone.size).toBe(2);
    expect(clone.get("a")).toEqual({ v: 1 });
    expect(clone.get("a")).not.toBe(map.get("a"));
  });

  test("Set instances are deeply cloned", () => {
    const inner = { x: 1 };
    const set = new Set([inner, 2, 3]);
    const clone = deepClone(set);
    expect(clone).not.toBe(set);
    expect(clone.size).toBe(3);

    const clonedInner = [...clone].find(
      (v) => typeof v === "object" && v !== null,
    ) as { x: number };
    expect(clonedInner).toEqual({ x: 1 });
    expect(clonedInner).not.toBe(inner);
  });

  test("circular references are handled", () => {
    const obj: Record<string, unknown> = { a: 1 };
    obj.self = obj;
    const clone = deepClone(obj);
    expect(clone).not.toBe(obj);
    expect(clone.a).toBe(1);
    expect(clone.self).toBe(clone);
  });

  test("freeze option makes cloned object immutable", () => {
    const obj = { a: 1, b: { c: 2 }, arr: [1, 2] };
    const clone = deepClone(obj, { freeze: true });
    expect(clone).toEqual(obj);
    expect(Object.isFrozen(clone)).toBe(true);
    expect(Object.isFrozen(clone.b)).toBe(true);
    expect(Object.isFrozen(clone.arr)).toBe(true);

    // Mutations should throw in strict mode or silently fail
    expect(() => {
      (clone as Record<string, unknown>).a = 99;
    }).toThrow();
    expect(clone.a).toBe(1);
  });

  test("nested mixed types", () => {
    const value = {
      arr: [1, new Date("2025-06-01")],
      map: new Map([["key", new Set([1, 2])]]),
      re: /test/i,
    };
    const clone = deepClone(value);
    expect(clone).toEqual(value);
    expect(clone).not.toBe(value);
    expect(clone.arr).not.toBe(value.arr);
    expect(clone.map).not.toBe(value.map);
    expect(clone.map.get("key")).not.toBe(value.map.get("key"));
  });
});
