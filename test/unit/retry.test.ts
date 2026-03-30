import { describe, it, expect, mock } from "bun:test"
import { retry, calculateDelay, defaultRetryOptions } from "../../src/retry.js"

describe("calculateDelay", () => {
  it("returns exponential delay without jitter", () => {
    expect(calculateDelay(0, { baseDelay: 100, maxDelay: 10000, jitter: false })).toBe(100)
    expect(calculateDelay(1, { baseDelay: 100, maxDelay: 10000, jitter: false })).toBe(200)
    expect(calculateDelay(2, { baseDelay: 100, maxDelay: 10000, jitter: false })).toBe(400)
    expect(calculateDelay(3, { baseDelay: 100, maxDelay: 10000, jitter: false })).toBe(800)
  })

  it("caps delay at maxDelay", () => {
    expect(calculateDelay(10, { baseDelay: 100, maxDelay: 500, jitter: false })).toBe(500)
  })

  it("applies jitter producing values between 0 and capped delay", () => {
    const results = new Set<number>()
    for (let i = 0; i < 50; i++) {
      const delay = calculateDelay(2, { baseDelay: 100, maxDelay: 10000, jitter: true })
      expect(delay).toBeGreaterThanOrEqual(0)
      expect(delay).toBeLessThanOrEqual(400)
      results.add(delay)
    }
    // With 50 samples of random jitter, we should get more than 1 unique value
    expect(results.size).toBeGreaterThan(1)
  })
})

describe("retry", () => {
  it("returns result on first successful attempt", async () => {
    const fn = mock(() => Promise.resolve("ok"))
    const result = await retry(fn, { maxRetries: 3, baseDelay: 1, jitter: false })
    expect(result).toBe("ok")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("retries on failure then succeeds", async () => {
    let calls = 0
    const fn = mock(() => {
      calls++
      if (calls < 3) return Promise.reject(new Error("fail"))
      return Promise.resolve("recovered")
    })

    const result = await retry(fn, { maxRetries: 3, baseDelay: 1, jitter: false })
    expect(result).toBe("recovered")
    expect(fn).toHaveBeenCalledTimes(3)
  })

  it("throws last error after exhausting all retries", async () => {
    const fn = mock(() => Promise.reject(new Error("persistent failure")))

    await expect(
      retry(fn, { maxRetries: 2, baseDelay: 1, jitter: false })
    ).rejects.toThrow("persistent failure")
    expect(fn).toHaveBeenCalledTimes(3) // initial + 2 retries
  })

  it("skips retry when retryOn predicate returns false", async () => {
    const nonRetryableError = new Error("not retryable")
    const fn = mock(() => Promise.reject(nonRetryableError))

    await expect(
      retry(fn, {
        maxRetries: 3,
        baseDelay: 1,
        jitter: false,
        retryOn: (err) => (err as Error).message !== "not retryable",
      })
    ).rejects.toThrow("not retryable")
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("retries when retryOn predicate returns true", async () => {
    let calls = 0
    const fn = mock(() => {
      calls++
      if (calls === 1) return Promise.reject(new Error("retryable"))
      return Promise.resolve("done")
    })

    const result = await retry(fn, {
      maxRetries: 3,
      baseDelay: 1,
      jitter: false,
      retryOn: () => true,
    })
    expect(result).toBe("done")
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("uses default options when none provided", async () => {
    const fn = mock(() => Promise.resolve(42))
    const result = await retry(fn)
    expect(result).toBe(42)
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("allows partial options override", async () => {
    let calls = 0
    const fn = mock(() => {
      calls++
      if (calls === 1) return Promise.reject(new Error("fail"))
      return Promise.resolve("ok")
    })

    const result = await retry(fn, { baseDelay: 1 })
    expect(result).toBe("ok")
    expect(fn).toHaveBeenCalledTimes(2)
  })
})

describe("defaultRetryOptions", () => {
  it("has expected default values", () => {
    expect(defaultRetryOptions.maxRetries).toBe(3)
    expect(defaultRetryOptions.baseDelay).toBe(1000)
    expect(defaultRetryOptions.maxDelay).toBe(30000)
    expect(defaultRetryOptions.jitter).toBe(true)
  })
})
