import React, { useEffect, useState, useCallback } from 'react'
import { api } from '../api/client'
import { useReview } from '../hooks/useReview'
import type { Agent, DiffStats } from '../types'

export function ReviewDashboard() {
  const [agents, setAgents] = useState<Agent[]>([])
  const [diffStats, setDiffStats] = useState<DiffStats | null>(null)
  const [selectedAgents, setSelectedAgents] = useState<string[]>([])
  const [mode, setMode] = useState<'staged' | 'unstaged' | 'branch'>('staged')
  const [initialLoading, setInitialLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const { isLoading, result, error, runReview, clearResult } = useReview()

  const loadAgents = useCallback(async () => {
    try {
      setLoadError(null)
      const agentList = await api.getAgents()
      setAgents(agentList)
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to load agents'
      setLoadError(errorMsg)
      console.error('Failed to load agents:', err)
    }
  }, [])

  const loadDiffStats = useCallback(async () => {
    try {
      const stats = await api.getDiff(mode)
      setDiffStats(stats)
    } catch (err) {
      console.error('Failed to load diff stats:', err)
    } finally {
      setInitialLoading(false)
    }
  }, [mode])

  useEffect(() => {
    loadAgents()
    loadDiffStats()
  }, [mode, loadAgents, loadDiffStats])

  const handleRunReview = useCallback(async () => {
    await runReview({
      mode,
      agents: selectedAgents.length > 0 ? selectedAgents : undefined,
      verify: true,
      fullFileContext: true,
    })
  }, [mode, selectedAgents, runReview])

  // Count issues by severity using the ACTUAL server response structure
  const getIssueSummary = () => {
    if (!result) return { total: 0, critical: 0, warning: 0, info: 0 }

    const summary = { total: result.issues.length, critical: 0, warning: 0, info: 0 }
    result.issues.forEach(issue => {
      if (issue.severity === 'critical') summary.critical++
      else if (issue.severity === 'warning') summary.warning++
      else if (issue.severity === 'info') summary.info++
    })
    return summary
  }

  const summary = getIssueSummary()

  return (
    <div className="container">
      <div className="header">
        <h1>OpenLens Code Review</h1>
        <p>AI-powered code review using specialized agents</p>
      </div>

      {loadError && (
        <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#ffeaea', color: '#d1242f', borderRadius: '6px' }} role="alert">
          Error loading data: {loadError}
        </div>
      )}

      {initialLoading && (
        <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f6f8fa', borderRadius: '6px' }} role="status">
          Loading agents and diff stats...
        </div>
      )}

      <div className="card">
        <h2>Review Configuration</h2>

        <div style={{ marginBottom: '16px' }}>
          <label htmlFor="review-mode-select">Review Mode:</label>
          <select
            id="review-mode-select"
            className="input"
            value={mode}
            onChange={(e) => {
              const newMode = e.target.value as 'staged' | 'unstaged' | 'branch'
              setMode(newMode)
            }}
            style={{ marginTop: '4px' }}
            aria-label="Select diff mode for code review"
          >
            <option value="staged">Staged Changes</option>
            <option value="unstaged">Unstaged Changes</option>
            <option value="branch">Branch Diff</option>
          </select>
        </div>

        {diffStats && (
          <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f6f8fa', borderRadius: '6px' }}>
            <strong>Changes:</strong> {diffStats.stats.filesChanged} files,
            +{diffStats.stats.insertions} insertions,
            -{diffStats.stats.deletions} deletions
          </div>
        )}

        <div style={{ marginBottom: '16px' }}>
          <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
            <legend style={{ fontSize: '1rem', fontWeight: 'normal', marginBottom: '8px' }}>Agents (leave empty for all):</legend>
            <div style={{ marginTop: '8px' }}>
              {agents.map(agent => (
                <label key={agent.name} style={{ display: 'block', marginBottom: '4px' }}>
                  <input
                    type="checkbox"
                    checked={selectedAgents.includes(agent.name)}
                    onChange={(e) => {
                      if (e.target.checked) {
                        setSelectedAgents([...selectedAgents, agent.name])
                      } else {
                        setSelectedAgents(selectedAgents.filter(a => a !== agent.name))
                      }
                    }}
                    style={{ marginRight: '8px' }}
                    aria-label={`Select ${agent.name} agent`}
                  />
                  {agent.name} - {agent.description || 'No description'}
                </label>
              ))}
            </div>
          </fieldset>
        </div>

        <button
          className="button"
          onClick={handleRunReview}
          disabled={isLoading || (diffStats?.stats.filesChanged === 0)}
          data-testid="run-review-button"
        >
          {isLoading ? 'Running Review...' : 'Run Review'}
        </button>

        {error && (
          <div style={{ marginTop: '16px', padding: '12px', backgroundColor: '#ffeaea', color: '#d1242f', borderRadius: '6px' }}>
            Error: {error}
          </div>
        )}
      </div>

      {result && (
        <div className="card" data-testid="review-results">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
            <h2>Review Results</h2>
            <button className="button" onClick={clearResult}>Clear Results</button>
          </div>

          <div style={{ marginBottom: '16px', padding: '12px', backgroundColor: '#f6f8fa', borderRadius: '6px' }}>
            <strong>Summary:</strong> {summary.total} issues found
            {summary.critical > 0 && <span className="status-failed"> • {summary.critical} critical</span>}
            {summary.warning > 0 && <span className="status-failed"> • {summary.warning} warning</span>}
            {summary.info > 0 && <span className="status-pending"> • {summary.info} info</span>}
          </div>

          <div>
            {result.issues.map((issue, index) => (
              <div key={index} style={{ border: '1px solid #e1e5e9', borderRadius: '6px', padding: '12px', marginBottom: '12px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                  <h3>{issue.title}</h3>
                  <div>
                    <span className={`status-${issue.severity === 'critical' ? 'failed' : issue.severity === 'warning' ? 'pending' : 'completed'}`}>
                      {issue.severity}
                    </span>
                    <span style={{ marginLeft: '8px', color: '#656d76' }}>
                      {issue.agent}
                    </span>
                  </div>
                </div>
                <p style={{ marginBottom: '8px' }}>{issue.message}</p>
                <div style={{ fontSize: '14px', color: '#656d76' }}>
                  {issue.file}:{issue.line}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
