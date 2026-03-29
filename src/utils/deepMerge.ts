/**
 * Options for controlling deep merge behavior
 */
export interface DeepMergeOptions {
  /**
   * Strategy for merging arrays
   * - 'replace': Target array replaces source array (default)
   * - 'concat': Concatenate arrays
   * - 'merge': Merge arrays by index
   */
  arrayStrategy?: 'replace' | 'concat' | 'merge';

  /**
   * Whether to clone the source objects to avoid mutations
   * @default true
   */
  clone?: boolean;
}

/**
 * Type guard to check if a value is a plain object
 */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    Object.prototype.toString.call(value) === '[object Object]' &&
    value.constructor === Object
  );
}

/**
 * Deep clone a value to avoid mutations
 */
function deepClone<T>(value: T): T {
  if (value === null || typeof value !== 'object') {
    return value;
  }

  if (Array.isArray(value)) {
    return value.map(item => deepClone(item)) as T;
  }

  if (isPlainObject(value)) {
    const cloned = {} as Record<string, unknown>;
    for (const [key, val] of Object.entries(value)) {
      cloned[key] = deepClone(val);
    }
    return cloned as T;
  }

  // For other objects (Date, RegExp, etc.), return as-is
  return value;
}

/**
 * Merge two arrays based on the specified strategy
 */
function mergeArrays(
  source: unknown[],
  target: unknown[],
  strategy: 'replace' | 'concat' | 'merge',
  visitedObjects: WeakSet<object>
): unknown[] {
  switch (strategy) {
    case 'replace':
      return target;
    case 'concat':
      return [...source, ...target];
    case 'merge':
      const result = [...source];
      for (let i = 0; i < target.length; i++) {
        if (i < result.length) {
          if (isPlainObject(result[i]) && isPlainObject(target[i])) {
            result[i] = deepMergeInternal(
              result[i] as Record<string, unknown>,
              target[i] as Record<string, unknown>,
              { arrayStrategy: strategy },
              visitedObjects
            );
          } else {
            result[i] = target[i];
          }
        } else {
          result[i] = target[i];
        }
      }
      return result;
    default:
      return target;
  }
}

/**
 * Check for circular references in an object
 */
function hasCircularReference(obj: unknown, visited = new WeakSet<object>()): boolean {
  if (obj === null || typeof obj !== 'object') {
    return false;
  }

  if (visited.has(obj as object)) {
    return true;
  }

  visited.add(obj as object);

  if (Array.isArray(obj)) {
    for (const item of obj) {
      if (hasCircularReference(item, visited)) {
        return true;
      }
    }
  } else if (isPlainObject(obj)) {
    for (const value of Object.values(obj)) {
      if (hasCircularReference(value, visited)) {
        return true;
      }
    }
  }

  visited.delete(obj as object);
  return false;
}

/**
 * Internal deep merge implementation with circular reference tracking
 */
function deepMergeInternal(
  source: Record<string, unknown>,
  target: Record<string, unknown>,
  options: DeepMergeOptions,
  visitedObjects: WeakSet<object>
): Record<string, unknown> {
  // Detect circular references
  if (visitedObjects.has(source) || visitedObjects.has(target)) {
    throw new Error('Circular reference detected during deep merge');
  }

  // Add current objects to visited set
  visitedObjects.add(source);
  visitedObjects.add(target);

  const result: Record<string, unknown> = options.clone ? deepClone(source) : { ...source };
  const arrayStrategy = options.arrayStrategy || 'replace';

  for (const [key, targetValue] of Object.entries(target)) {
    const sourceValue = result[key];

    // Handle null/undefined values
    if (targetValue === null || targetValue === undefined) {
      result[key] = targetValue;
      continue;
    }

    if (sourceValue === null || sourceValue === undefined) {
      result[key] = options.clone ? deepClone(targetValue) : targetValue;
      continue;
    }

    // Handle arrays
    if (Array.isArray(sourceValue) && Array.isArray(targetValue)) {
      result[key] = mergeArrays(sourceValue, targetValue, arrayStrategy, visitedObjects);
      continue;
    }

    // Handle plain objects
    if (isPlainObject(sourceValue) && isPlainObject(targetValue)) {
      result[key] = deepMergeInternal(sourceValue, targetValue, options, visitedObjects);
      continue;
    }

    // For all other cases, target value takes precedence
    result[key] = options.clone ? deepClone(targetValue) : targetValue;
  }

  // Remove objects from visited set after processing
  visitedObjects.delete(source);
  visitedObjects.delete(target);

  return result;
}

/**
 * Deep merge two or more objects recursively
 *
 * @param source - The source object to merge into
 * @param targets - One or more target objects to merge from, with optional options as last argument
 * @returns A new object with merged properties
 *
 * @example
 * ```typescript
 * const obj1 = { a: 1, b: { c: 2 } };
 * const obj2 = { b: { d: 3 }, e: 4 };
 * const result = deepMerge(obj1, obj2);
 * // Result: { a: 1, b: { c: 2, d: 3 }, e: 4 }
 * ```
 */
export function deepMerge<T extends Record<string, unknown>>(
  source: T,
  ...args: Array<Partial<T> | DeepMergeOptions>
): T {
  if (!isPlainObject(source)) {
    throw new TypeError('Source must be a plain object');
  }

  // Check for circular references in source
  if (hasCircularReference(source)) {
    throw new Error('Circular reference detected during deep merge');
  }

  // Extract options from last argument if it's not a plain object with meaningful properties
  let options: DeepMergeOptions = { clone: true };
  let targets: Partial<T>[];

  if (args.length > 0) {
    const lastArg = args[args.length - 1];
    const isOptionsObject = (
      lastArg !== null &&
      typeof lastArg === 'object' &&
      !Array.isArray(lastArg) &&
      (
        'arrayStrategy' in lastArg ||
        'clone' in lastArg
      ) &&
      // Ensure it's not a data object by checking it has ONLY option properties
      Object.keys(lastArg).length > 0 &&
      Object.keys(lastArg).every(key => ['arrayStrategy', 'clone'].includes(key)) &&
      // Check the values are of the correct types for options
      (
        !('arrayStrategy' in lastArg) ||
        ['replace', 'concat', 'merge'].includes((lastArg as any).arrayStrategy)
      ) &&
      (
        !('clone' in lastArg) ||
        typeof (lastArg as any).clone === 'boolean'
      )
    );

    if (isOptionsObject) {
      options = { ...options, ...lastArg as DeepMergeOptions };
      targets = args.slice(0, -1) as Partial<T>[];
    } else {
      targets = args as Partial<T>[];
    }
  } else {
    targets = [];
  }

  let result = source;
  const visitedObjects = new WeakSet<object>();

  for (const target of targets) {
    if (!isPlainObject(target)) {
      throw new TypeError('All targets must be plain objects');
    }

    // Check for circular references in target
    if (hasCircularReference(target)) {
      throw new Error('Circular reference detected during deep merge');
    }

    result = deepMergeInternal(result, target, options, visitedObjects) as T;
  }

  return result;
}

/**
 * Deep merge with array concatenation strategy
 */
export function deepMergeConcat<T extends Record<string, unknown>>(
  source: T,
  ...targets: Partial<T>[]
): T {
  return deepMerge(source, ...targets, { arrayStrategy: 'concat' });
}

/**
 * Deep merge with array index-based merging strategy
 */
export function deepMergeArrays<T extends Record<string, unknown>>(
  source: T,
  ...targets: Partial<T>[]
): T {
  return deepMerge(source, ...targets, { arrayStrategy: 'merge' });
}