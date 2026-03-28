/**
 * OpenLens API Client
 *
 * Provides a typed interface for communicating with the OpenLens HTTP server.
 * All methods handle request/response serialization and error handling.
 */

import type {
  ReviewRequest,
  ReviewResult,
  Agent,
  DiffStats,
} from '../types'

export class OpenLensAPI {
  private baseUrl: string

  constructor(baseUrl = '/api') {
    this.baseUrl = baseUrl
  }

  /**
   * Check server health status
   */
  async health(): Promise<{ status: string }> {
    const response = await fetch(`${this.baseUrl}/health`)
    if (!response.ok) {
      throw new Error(`Health check failed: ${response.statusText}`)
    }
    return response.json()
  }

  /**
   * Get list of available review agents
   */
  async getAgents(): Promise<Agent[]> {
    const response = await fetch(`${this.baseUrl}/agents`)
    if (!response.ok) {
      throw new Error(`Failed to fetch agents: ${response.statusText}`)
    }
    return response.json()
  }

  /**
   * Get configuration (sensitive data redacted)
   */
  async getConfig(): Promise<any> {
    const response = await fetch(`${this.baseUrl}/config`)
    if (!response.ok) {
      throw new Error(`Failed to fetch config: ${response.statusText}`)
    }
    return response.json()
  }

  /**
   * Get diff statistics for a given mode
   * @param mode The diff mode: 'staged', 'unstaged', or 'branch'
   */
  async getDiff(mode: 'staged' | 'unstaged' | 'branch' = 'staged'): Promise<DiffStats> {
    const response = await fetch(`${this.baseUrl}/diff?mode=${mode}`)
    if (!response.ok) {
      throw new Error(`Failed to fetch diff: ${response.statusText}`)
    }
    return response.json()
  }

  /**
   * Run a code review with the specified configuration
   * @param request Review request configuration
   */
  async runReview(request: ReviewRequest): Promise<ReviewResult> {
    const response = await fetch(`${this.baseUrl}/review`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
    })
    if (!response.ok) {
      throw new Error(`Review failed: ${response.statusText}`)
    }
    return response.json()
  }
}

/**
 * Default API client instance configured to use /api base URL
 */
export const api = new OpenLensAPI()
