import { describe, test, expect, mock, beforeEach, afterEach } from "bun:test"
import { Window } from "happy-dom"
import React from "react"
import { createRoot } from "react-dom/client"
import { act } from "react"
import { ErrorBoundary } from "../../src/components/ErrorBoundary.js"

// Set up a DOM environment via happy-dom
const happyWindow = new Window()
Object.assign(globalThis, {
  window: happyWindow,
  document: happyWindow.document,
  navigator: happyWindow.navigator,
  HTMLElement: happyWindow.HTMLElement,
  HTMLDivElement: happyWindow.HTMLDivElement,
  Element: happyWindow.Element,
  Node: happyWindow.Node,
  Event: happyWindow.Event,
  MouseEvent: happyWindow.MouseEvent,
  requestAnimationFrame: happyWindow.requestAnimationFrame.bind(happyWindow),
  cancelAnimationFrame: happyWindow.cancelAnimationFrame.bind(happyWindow),
  MutationObserver: happyWindow.MutationObserver,
})

function ThrowingChild({ shouldThrow }: { shouldThrow: boolean }) {
  if (shouldThrow) {
    throw new Error("Test render error")
  }
  return <span>child content</span>
}

function renderInto(element: React.ReactNode): HTMLElement {
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  act(() => {
    root.render(element)
  })
  return container
}

describe("ErrorBoundary", () => {
  let originalConsoleError: typeof console.error

  beforeEach(() => {
    originalConsoleError = console.error
    // Suppress React's error boundary logging + our own logging during tests
    console.error = mock(() => {})
  })

  afterEach(() => {
    console.error = originalConsoleError
    document.body.innerHTML = ""
  })

  test("renders children when no error occurs", () => {
    const container = renderInto(
      <ErrorBoundary>
        <span>hello world</span>
      </ErrorBoundary>
    )
    expect(container.innerHTML).toContain("hello world")
  })

  test("renders default fallback UI when a child throws", () => {
    const container = renderInto(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(container.innerHTML).toContain("Something went wrong")
    expect(container.innerHTML).toContain("Test render error")
    expect(container.innerHTML).toContain("Try again")
    expect(container.innerHTML).toContain('role="alert"')
  })

  test("renders custom fallback ReactNode when provided", () => {
    const container = renderInto(
      <ErrorBoundary fallback={<div>custom fallback</div>}>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(container.innerHTML).toContain("custom fallback")
    expect(container.innerHTML).not.toContain("Something went wrong")
  })

  test("renders custom fallback function when provided", () => {
    const container = renderInto(
      <ErrorBoundary
        fallback={(error, _reset) => (
          <div>Error: {error.message}</div>
        )}
      >
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(container.innerHTML).toContain("Error: Test render error")
  })

  test("calls onError callback when an error is caught", () => {
    const onError = mock(() => {})

    renderInto(
      <ErrorBoundary onError={onError}>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    )

    expect(onError).toHaveBeenCalledTimes(1)
    const [error] = onError.mock.calls[0]
    expect(error).toBeInstanceOf(Error)
    expect(error.message).toBe("Test render error")
  })

  test("does not call onError when no error occurs", () => {
    const onError = mock(() => {})

    renderInto(
      <ErrorBoundary onError={onError}>
        <span>safe</span>
      </ErrorBoundary>
    )

    expect(onError).not.toHaveBeenCalled()
  })

  test("logs error to console.error via componentDidCatch", () => {
    renderInto(
      <ErrorBoundary>
        <ThrowingChild shouldThrow={true} />
      </ErrorBoundary>
    )

    const consoleErrorMock = console.error as ReturnType<typeof mock>
    const openlensCall = consoleErrorMock.mock.calls.find(
      (args: unknown[]) => typeof args[0] === "string" && args[0].includes("[openlens]")
    )
    expect(openlensCall).toBeDefined()
  })

  test("getDerivedStateFromError returns correct state", () => {
    const error = new Error("test")
    const state = ErrorBoundary.getDerivedStateFromError(error)
    expect(state).toEqual({ hasError: true, error })
  })

  test("reset clears error state and re-renders children", () => {
    let shouldThrow = true
    function MaybeThrow() {
      if (shouldThrow) throw new Error("boom")
      return <span>recovered</span>
    }

    const container = renderInto(
      <ErrorBoundary>
        <MaybeThrow />
      </ErrorBoundary>
    )

    expect(container.innerHTML).toContain("Something went wrong")

    // Stop throwing, then click "Try again"
    shouldThrow = false
    // Find the button by searching through child elements
    const buttons = container.getElementsByTagName("button")
    expect(buttons.length).toBeGreaterThan(0)
    act(() => {
      buttons[0].click()
    })

    expect(container.innerHTML).toContain("recovered")
    expect(container.innerHTML).not.toContain("Something went wrong")
  })
})
