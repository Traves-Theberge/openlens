export interface MemoizeOptions {
  /** Maximum number of cached entries. Oldest evicted first (LRU). */
  maxSize?: number;
  /** Time-to-live in milliseconds. Entries expire after this duration. */
  ttl?: number;
}

interface CacheEntry<V> {
  value: V;
  expiry: number | null;
}

type AnyFunction = (...args: any[]) => any;

export interface CacheStats {
  /** Number of cache hits. */
  hits: number;
  /** Number of cache misses. */
  misses: number;
  /** Current number of entries in the cache. */
  size: number;
}

export type MemoizedFunction<F extends AnyFunction> = F & {
  /** Remove all cached entries. */
  clear(): void;
  /** Return hit/miss counts and current cache size. */
  stats(): CacheStats;
};

export function memoize<F extends AnyFunction>(
  fn: F,
  options: MemoizeOptions = {},
): MemoizedFunction<F> {
  const { maxSize, ttl } = options;
  const cache = new Map<string, CacheEntry<ReturnType<F>>>();
  let hits = 0;
  let misses = 0;

  const memoized = function (this: unknown, ...args: Parameters<F>): ReturnType<F> {
    const key = JSON.stringify(args);

    if (cache.has(key)) {
      const entry = cache.get(key)!;
      if (entry.expiry !== null && Date.now() > entry.expiry) {
        cache.delete(key);
      } else {
        // Move to end for LRU freshness
        cache.delete(key);
        cache.set(key, entry);
        hits++;
        return entry.value;
      }
    }

    misses++;

    const result = fn.apply(this, args) as ReturnType<F>;

    if (maxSize !== undefined && cache.size >= maxSize) {
      // Evict oldest (first) entry
      const firstKey = cache.keys().next().value!;
      cache.delete(firstKey);
    }

    cache.set(key, {
      value: result,
      expiry: ttl !== undefined ? Date.now() + ttl : null,
    });

    return result;
  } as MemoizedFunction<F>;

  memoized.clear = () => {
    cache.clear();
    hits = 0;
    misses = 0;
  };

  memoized.stats = (): CacheStats => ({
    hits,
    misses,
    size: cache.size,
  });

  return memoized;
}
