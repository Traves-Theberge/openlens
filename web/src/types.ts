/**
 * TypeScript interface definitions for OpenLens API communication
 */

export interface ReviewRequest {
  mode: 'staged' | 'unstaged' | 'branch'
  agents?: string[]
  branch?: string
  verify?: boolean
  fullFileContext?: boolean
}

export interface Issue {
  title: string
  description: string
  severity: 'critical' | 'high' | 'medium' | 'low'
  confidence: 'high' | 'medium' | 'low'
  file?: string
  line?: number
  agent: string
  fingerprint: string
}

export interface ReviewResult {
  issues: Issue[]
  summary: {
    total: number
    critical: number
    high: number
    medium: number
    low: number
  }
  agents: string[]
  timestamp: string
}

export interface Agent {
  name: string
  description: string
  model: string
  mode: string[]
  steps: number
  fullFileContext: boolean
  permission: Record<string, boolean>
}

export interface DiffStats {
  mode: string
  stats: {
    filesChanged: number
    insertions: number
    deletions: number
  }
}

