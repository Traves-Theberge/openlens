import { useState, useCallback } from 'react'
import { api } from '../api/client'
import type { ReviewRequest, ReviewResult } from '../types'

interface UseReviewReturn {
  isLoading: boolean
  result: ReviewResult | null
  error: string | null
  runReview: (request: ReviewRequest) => Promise<void>
  clearResult: () => void
}

export function useReview(): UseReviewReturn {
  const [isLoading, setIsLoading] = useState(false)
  const [result, setResult] = useState<ReviewResult | null>(null)
  const [error, setError] = useState<string | null>(null)

  const runReview = useCallback(async (request: ReviewRequest) => {
    setIsLoading(true)
    setError(null)

    try {
      const reviewResult = await api.runReview(request)
      setResult(reviewResult)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Review failed')
    } finally {
      setIsLoading(false)
    }
  }, [])

  const clearResult = useCallback(() => {
    setResult(null)
    setError(null)
  }, [])

  return { isLoading, result, error, runReview, clearResult }
}
