/**
 * Deep clone utility supporting objects, arrays, Date, RegExp, Map, Set,
 * and circular references.
 */
export function deepClone<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  // Primitives and functions are returned as-is
  if (value === null || typeof value !== "object") {
    return value;
  }

  const obj = value as object;

  // Handle circular references
  if (seen.has(obj)) {
    return seen.get(obj) as T;
  }

  if (value instanceof Date) {
    return new Date(value.getTime()) as T;
  }

  if (value instanceof RegExp) {
    return new RegExp(value.source, value.flags) as T;
  }

  if (value instanceof Map) {
    const map = new Map();
    seen.set(obj, map);
    for (const [k, v] of value) {
      map.set(deepClone(k, seen), deepClone(v, seen));
    }
    return map as T;
  }

  if (value instanceof Set) {
    const set = new Set();
    seen.set(obj, set);
    for (const v of value) {
      set.add(deepClone(v, seen));
    }
    return set as T;
  }

  if (Array.isArray(value)) {
    const arr: unknown[] = [];
    seen.set(obj, arr);
    for (const item of value) {
      arr.push(deepClone(item, seen));
    }
    return arr as T;
  }

  // Plain objects
  const clone = Object.create(Object.getPrototypeOf(obj));
  seen.set(obj, clone);
  for (const key of Reflect.ownKeys(obj)) {
    (clone as Record<string | symbol, unknown>)[key] = deepClone(
      (obj as Record<string | symbol, unknown>)[key],
      seen,
    );
  }
  return clone as T;
}
