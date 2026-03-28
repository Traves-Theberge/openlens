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
  file: string
  line: number
  endLine?: number
  severity: 'critical' | 'warning' | 'info'
  agent: string
  title: string
  message: string
  fix?: string
  patch?: string
  confidence: 'high' | 'medium' | 'low'
}

export interface ReviewResult {
  issues: Issue[]
  timing: Record<string, number>
  meta?: {
    mode: string
    filesChanged: number
    agentsRun: number
    agentsFailed: number
    suppressed: number
    verified: boolean
  }
}

export interface Agent {
  name: string
  description?: string
  model: string
  mode: 'primary' | 'subagent' | 'all'
  steps: number
  fullFileContext?: boolean
  permission: Record<string, any>
}

export interface DiffStats {
  mode: string
  stats: {
    filesChanged: number
    insertions: number
    deletions: number
  }
}

export interface HealthResponse {
  status: string
}

export interface ServerInfo {
  name: string
  version: string
}

