export interface DeepCloneOptions {
  /** When true, the cloned object (and all nested clones) are frozen with Object.freeze. */
  freeze?: boolean;
}

/**
 * Deep clone utility supporting objects, arrays, Date, RegExp, Map, Set,
 * and circular references. Optionally freezes the result.
 */
export function deepClone<T>(
  value: T,
  options?: DeepCloneOptions,
): T;
/** @internal */
export function deepClone<T>(
  value: T,
  options?: DeepCloneOptions,
  seen?: WeakMap<object, unknown>,
): T;
export function deepClone<T>(
  value: T,
  options: DeepCloneOptions = {},
  seen = new WeakMap<object, unknown>(),
): T {
  const shouldFreeze = options.freeze ?? false;
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
    const d = new Date(value.getTime());
    if (shouldFreeze) Object.freeze(d);
    return d as T;
  }

  if (value instanceof RegExp) {
    const r = new RegExp(value.source, value.flags);
    if (shouldFreeze) Object.freeze(r);
    return r as T;
  }

  if (value instanceof Map) {
    const map = new Map();
    seen.set(obj, map);
    for (const [k, v] of value) {
      map.set(deepClone(k, options, seen), deepClone(v, options, seen));
    }
    return map as T;
  }

  if (value instanceof Set) {
    const set = new Set();
    seen.set(obj, set);
    for (const v of value) {
      set.add(deepClone(v, options, seen));
    }
    return set as T;
  }

  if (Array.isArray(value)) {
    const arr: unknown[] = [];
    seen.set(obj, arr);
    for (const item of value) {
      arr.push(deepClone(item, options, seen));
    }
    if (shouldFreeze) Object.freeze(arr);
    return arr as T;
  }

  // Plain objects
  const clone = Object.create(Object.getPrototypeOf(obj));
  seen.set(obj, clone);
  for (const key of Reflect.ownKeys(obj)) {
    (clone as Record<string | symbol, unknown>)[key] = deepClone(
      (obj as Record<string | symbol, unknown>)[key],
      options,
      seen,
    );
  }
  if (shouldFreeze) Object.freeze(clone);
  return clone as T;
}
