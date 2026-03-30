export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries: number
  /** Base delay in milliseconds (default: 1000) */
  baseDelay: number
  /** Maximum delay in milliseconds (default: 30000) */
  maxDelay: number
  /** Whether to add random jitter to delays (default: true) */
  jitter: boolean
  /** Optional predicate to determine if an error is retryable. Defaults to retrying all errors. */
  retryOn?: (error: unknown) => boolean
}

export const defaultRetryOptions: RetryOptions = {
  maxRetries: 3,
  baseDelay: 1000,
  maxDelay: 30000,
  jitter: true,
}

/**
 * Calculate delay for a given attempt using exponential backoff with optional jitter.
 */
export function calculateDelay(
  attempt: number,
  options: Pick<RetryOptions, "baseDelay" | "maxDelay" | "jitter">
): number {
  const exponentialDelay = options.baseDelay * Math.pow(2, attempt)
  const capped = Math.min(exponentialDelay, options.maxDelay)
  if (!options.jitter) return capped
  return Math.round(capped * Math.random())
}

/**
 * Retry an async function with exponential backoff and optional jitter.
 */
export async function retry<T>(
  fn: () => Promise<T>,
  options?: Partial<RetryOptions>
): Promise<T> {
  const opts: RetryOptions = { ...defaultRetryOptions, ...options }
  let lastError: unknown

  for (let attempt = 0; attempt <= opts.maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      if (opts.retryOn && !opts.retryOn(error)) {
        throw error
      }

      if (attempt === opts.maxRetries) {
        break
      }

      const delay = calculateDelay(attempt, opts)
      await new Promise((resolve) => setTimeout(resolve, delay))
    }
  }

  throw lastError
}
