import { describe, test, expect } from "bun:test"
import { deepMerge, deepMergeConcat, deepMergeArrays, type DeepMergeOptions } from "../../src/utils/deepMerge.js"

describe("deepMerge", () => {
  describe("basic object merging", () => {
    test("merges simple objects", () => {
      const obj1 = { a: 1, b: 2 }
      const obj2 = { b: 3, c: 4 }
      const result = deepMerge(obj1, obj2)

      expect(result).toEqual({ a: 1, b: 3, c: 4 })
    })

    test("does not mutate original objects by default", () => {
      const obj1 = { a: 1, b: { c: 2 } }
      const obj2 = { b: { d: 3 } }
      const original1 = JSON.parse(JSON.stringify(obj1))
      const original2 = JSON.parse(JSON.stringify(obj2))

      deepMerge(obj1, obj2)

      expect(obj1).toEqual(original1)
      expect(obj2).toEqual(original2)
    })

    test("merges multiple objects", () => {
      const obj1 = { a: 1 }
      const obj2 = { b: 2 }
      const obj3 = { c: 3 }
      const result = deepMerge(obj1, obj2, obj3)

      expect(result).toEqual({ a: 1, b: 2, c: 3 })
    })

    test("handles empty objects", () => {
      expect(deepMerge({}, { a: 1 })).toEqual({ a: 1 })
      expect(deepMerge({ a: 1 }, {})).toEqual({ a: 1 })
      expect(deepMerge({}, {})).toEqual({})
    })
  })

  describe("nested object merging", () => {
    test("merges nested objects", () => {
      const obj1 = { a: 1, b: { c: 2, d: 3 } }
      const obj2 = { b: { d: 4, e: 5 }, f: 6 }
      const result = deepMerge(obj1, obj2)

      expect(result).toEqual({
        a: 1,
        b: { c: 2, d: 4, e: 5 },
        f: 6
      })
    })

    test("merges deeply nested objects", () => {
      const obj1 = {
        level1: {
          level2: {
            level3: { a: 1, b: 2 }
          }
        }
      }
      const obj2 = {
        level1: {
          level2: {
            level3: { b: 3, c: 4 },
            other: "value"
          }
        }
      }
      const result = deepMerge(obj1, obj2)

      expect(result).toEqual({
        level1: {
          level2: {
            level3: { a: 1, b: 3, c: 4 },
            other: "value"
          }
        }
      })
    })

    test("handles mixed nested structures", () => {
      const obj1 = { a: { b: 1 }, c: "string" }
      const obj2 = { a: { d: 2 }, c: { nested: true } }
      const result = deepMerge(obj1, obj2)

      expect(result).toEqual({
        a: { b: 1, d: 2 },
        c: { nested: true }
      })
    })
  })

  describe("array merging strategies", () => {
    test("replaces arrays by default", () => {
      const obj1 = { arr: [1, 2, 3] }
      const obj2 = { arr: [4, 5] }
      const result = deepMerge(obj1, obj2)

      expect(result.arr).toEqual([4, 5])
    })

    test("replaces arrays with explicit replace strategy", () => {
      const obj1 = { arr: [1, 2, 3] }
      const obj2 = { arr: [4, 5] }
      const result = deepMerge(obj1, obj2, { arrayStrategy: 'replace' })

      expect(result.arr).toEqual([4, 5])
    })

    test("concatenates arrays with concat strategy", () => {
      const obj1 = { arr: [1, 2] }
      const obj2 = { arr: [3, 4] }
      const result = deepMerge(obj1, obj2, { arrayStrategy: 'concat' })

      expect(result.arr).toEqual([1, 2, 3, 4])
    })

    test("merges arrays by index with merge strategy", () => {
      const obj1 = { arr: [1, 2, 3] }
      const obj2 = { arr: [10, 20] }
      const result = deepMerge(obj1, obj2, { arrayStrategy: 'merge' })

      expect(result.arr).toEqual([10, 20, 3])
    })

    test("merges nested objects within arrays using merge strategy", () => {
      const obj1 = { arr: [{ a: 1 }, { b: 2 }] }
      const obj2 = { arr: [{ c: 3 }, { d: 4 }] }
      const result = deepMerge(obj1, obj2, { arrayStrategy: 'merge' })

      expect(result.arr).toEqual([{ a: 1, c: 3 }, { b: 2, d: 4 }])
    })

    test("handles arrays of different lengths in merge strategy", () => {
      const obj1 = { arr: [1] }
      const obj2 = { arr: [10, 20, 30] }
      const result = deepMerge(obj1, obj2, { arrayStrategy: 'merge' })

      expect(result.arr).toEqual([10, 20, 30])
    })
  })

  describe("null and undefined handling", () => {
    test("handles null values", () => {
      const obj1 = { a: 1, b: null }
      const obj2 = { a: null, c: 3 }
      const result = deepMerge(obj1, obj2)

      expect(result).toEqual({ a: null, b: null, c: 3 })
    })

    test("handles undefined values", () => {
      const obj1 = { a: 1, b: undefined }
      const obj2 = { a: undefined, c: 3 }
      const result = deepMerge(obj1, obj2)

      expect(result).toEqual({ a: undefined, b: undefined, c: 3 })
    })

    test("overwrites values with null", () => {
      const obj1 = { a: { nested: true } }
      const obj2 = { a: null }
      const result = deepMerge(obj1, obj2)

      expect(result.a).toBeNull()
    })

    test("sets null values to non-null", () => {
      const obj1 = { a: null }
      const obj2 = { a: { nested: true } }
      const result = deepMerge(obj1, obj2)

      expect(result.a).toEqual({ nested: true })
    })
  })

  describe("circular reference detection", () => {
    test("throws on direct circular reference", () => {
      const obj1: any = { a: 1 }
      obj1.self = obj1
      const obj2 = { b: 2 }

      expect(() => deepMerge(obj1, obj2)).toThrow("Circular reference detected during deep merge")
    })

    test("throws on indirect circular reference", () => {
      const obj1: any = { a: { b: {} } }
      obj1.a.b.back = obj1.a
      const obj2 = { c: 3 }

      expect(() => deepMerge(obj1, obj2)).toThrow("Circular reference detected during deep merge")
    })

    test("throws on circular reference in target", () => {
      const obj1 = { a: 1 }
      const obj2: any = { b: {} }
      obj2.b.self = obj2

      expect(() => deepMerge(obj1, obj2)).toThrow("Circular reference detected during deep merge")
    })
  })

  describe("type safety and edge cases", () => {
    test("throws on non-object source", () => {
      expect(() => deepMerge("not an object" as any, {})).toThrow("Source must be a plain object")
      expect(() => deepMerge(null as any, {})).toThrow("Source must be a plain object")
      expect(() => deepMerge(42 as any, {})).toThrow("Source must be a plain object")
      expect(() => deepMerge([] as any, {})).toThrow("Source must be a plain object")
    })

    test("throws on non-object targets", () => {
      expect(() => deepMerge({}, "not an object" as any)).toThrow("All targets must be plain objects")
      expect(() => deepMerge({}, null as any)).toThrow("All targets must be plain objects")
      expect(() => deepMerge({}, [] as any)).toThrow("All targets must be plain objects")
    })

    test("handles Date objects", () => {
      const date = new Date("2023-01-01")
      const obj1 = { date: new Date("2022-01-01") }
      const obj2 = { date }
      const result = deepMerge(obj1, obj2)

      expect(result.date).toBe(date)
    })

    test("handles RegExp objects", () => {
      const regex = /test/g
      const obj1 = { regex: /old/ }
      const obj2 = { regex }
      const result = deepMerge(obj1, obj2)

      expect(result.regex).toBe(regex)
    })

    test("handles functions", () => {
      const fn = () => "test"
      const obj1 = { fn: () => "old" }
      const obj2 = { fn }
      const result = deepMerge(obj1, obj2)

      expect(result.fn).toBe(fn)
    })

    test("handles class instances", () => {
      class TestClass {
        value: string
        constructor(value: string) {
          this.value = value
        }
      }

      const instance = new TestClass("test")
      const obj1 = { instance: new TestClass("old") }
      const obj2 = { instance }
      const result = deepMerge(obj1, obj2)

      expect(result.instance).toBe(instance)
    })
  })

  describe("cloning behavior", () => {
    test("clones by default", () => {
      const nested = { value: 1 }
      const obj1 = { a: nested }
      const obj2 = { b: 2 }
      const result = deepMerge(obj1, obj2)

      // Modify original
      nested.value = 999

      // Result should not be affected
      expect((result.a as any).value).toBe(1)
    })

    test("respects clone: false option", () => {
      const nested = { value: 1 }
      const obj1 = { a: nested }
      const obj2 = { b: 2 }
      const result = deepMerge(obj1, obj2, { clone: false })

      // Modify original
      nested.value = 999

      // Result should be affected since no cloning occurred
      expect((result.a as any).value).toBe(999)
    })
  })

  describe("options handling", () => {
    test("distinguishes between options and data objects", () => {
      const obj1 = { a: 1 }
      const obj2 = { b: 2 }
      const dataObject = { arrayStrategy: "some data value", clone: "not a boolean" }

      // This should treat the third argument as a data object, not options
      const result = deepMerge(obj1, obj2, dataObject as any)

      expect(result).toEqual({
        a: 1,
        b: 2,
        arrayStrategy: "some data value",
        clone: "not a boolean"
      })
    })

    test("correctly identifies real options object", () => {
      const obj1 = { arr: [1, 2] }
      const obj2 = { arr: [3, 4] }
      const options: DeepMergeOptions = { arrayStrategy: 'concat' }

      const result = deepMerge(obj1, obj2, options)

      expect(result.arr).toEqual([1, 2, 3, 4])
    })
  })
})

describe("deepMergeConcat", () => {
  test("uses concat array strategy", () => {
    const obj1 = { arr: [1, 2] }
    const obj2 = { arr: [3, 4] }
    const result = deepMergeConcat(obj1, obj2)

    expect(result.arr).toEqual([1, 2, 3, 4])
  })
})

describe("deepMergeArrays", () => {
  test("uses merge array strategy", () => {
    const obj1 = { arr: [1, 2, 3] }
    const obj2 = { arr: [10, 20] }
    const result = deepMergeArrays(obj1, obj2)

    expect(result.arr).toEqual([10, 20, 3])
  })
})