import React from "react"

export interface ErrorBoundaryProps {
  children: React.ReactNode
  /** Custom fallback UI to render when an error is caught */
  fallback?: React.ReactNode | ((error: Error, reset: () => void) => React.ReactNode)
  /** Called when an error is caught, for external logging */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void
}

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export class ErrorBoundary extends React.Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error }
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    console.error("[openlens] ErrorBoundary caught an error:", error, errorInfo)
    this.props.onError?.(error, errorInfo)
  }

  reset = (): void => {
    this.setState({ hasError: false, error: null })
  }

  render(): React.ReactNode {
    if (this.state.hasError && this.state.error) {
      const { fallback } = this.props

      if (typeof fallback === "function") {
        return fallback(this.state.error, this.reset)
      }

      if (fallback !== undefined) {
        return fallback
      }

      return (
        <div role="alert" style={{ padding: "1rem", fontFamily: "sans-serif" }}>
          <h2 style={{ color: "#d32f2f", marginTop: 0 }}>Something went wrong</h2>
          <p style={{ color: "#555" }}>{this.state.error.message}</p>
          <button
            onClick={this.reset}
            style={{
              padding: "0.5rem 1rem",
              cursor: "pointer",
              border: "1px solid #ccc",
              borderRadius: "4px",
              background: "#f5f5f5",
            }}
          >
            Try again
          </button>
        </div>
      )
    }

    return this.props.children
  }
}
