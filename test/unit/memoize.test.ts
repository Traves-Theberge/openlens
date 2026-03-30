import { describe, it, expect, beforeEach } from "bun:test";
import { memoize } from "../../src/util/memoize";

describe("memoize", () => {
  it("returns cached result for same arguments", () => {
    let callCount = 0;
    const fn = memoize((a: number, b: number) => {
      callCount++;
      return a + b;
    });

    expect(fn(1, 2)).toBe(3);
    expect(fn(1, 2)).toBe(3);
    expect(callCount).toBe(1);
  });

  it("recomputes for different arguments", () => {
    let callCount = 0;
    const fn = memoize((x: number) => {
      callCount++;
      return x * 2;
    });

    expect(fn(2)).toBe(4);
    expect(fn(3)).toBe(6);
    expect(callCount).toBe(2);
  });

  it("handles zero arguments", () => {
    let callCount = 0;
    const fn = memoize(() => {
      callCount++;
      return 42;
    });

    expect(fn()).toBe(42);
    expect(fn()).toBe(42);
    expect(callCount).toBe(1);
  });

  describe("maxSize", () => {
    it("evicts oldest entry when cache exceeds maxSize", () => {
      let callCount = 0;
      const fn = memoize(
        (x: number) => {
          callCount++;
          return x * 10;
        },
        { maxSize: 2 },
      );

      fn(1); // cache: [1]
      fn(2); // cache: [1, 2]
      fn(3); // cache: [2, 3] — 1 evicted

      callCount = 0;
      fn(2); // cached
      expect(callCount).toBe(0);

      fn(1); // recomputed (was evicted)
      expect(callCount).toBe(1);
    });
  });

  describe("ttl", () => {
    it("returns cached value before TTL expires", () => {
      let callCount = 0;
      const fn = memoize(
        (x: number) => {
          callCount++;
          return x;
        },
        { ttl: 1000 },
      );

      fn(1);
      fn(1);
      expect(callCount).toBe(1);
    });

    it("recomputes after TTL expires", () => {
      let callCount = 0;
      const now = Date.now();
      let currentTime = now;
      const originalDateNow = Date.now;
      Date.now = () => currentTime;

      try {
        const fn = memoize(
          (x: number) => {
            callCount++;
            return x;
          },
          { ttl: 100 },
        );

        fn(1);
        expect(callCount).toBe(1);

        // Advance time past TTL
        currentTime = now + 150;
        fn(1);
        expect(callCount).toBe(2);
      } finally {
        Date.now = originalDateNow;
      }
    });
  });

  describe("clear", () => {
    it("empties the cache", () => {
      let callCount = 0;
      const fn = memoize((x: number) => {
        callCount++;
        return x;
      });

      fn(1);
      fn(2);
      expect(callCount).toBe(2);

      fn.clear();

      fn(1);
      fn(2);
      expect(callCount).toBe(4);
    });
  });

  describe("TypeScript generics", () => {
    it("preserves input and output types", () => {
      const fn = memoize((a: string, b: number): boolean => {
        return a.length > b;
      });

      const result: boolean = fn("hello", 3);
      expect(result).toBe(true);
    });

    it("works with complex return types", () => {
      interface User {
        name: string;
        age: number;
      }
      const fn = memoize((name: string, age: number): User => {
        return { name, age };
      });

      const result = fn("Alice", 30);
      expect(result).toEqual({ name: "Alice", age: 30 });
    });
  });
});
