import { Component, type ErrorInfo, type ReactNode } from 'react'

interface RendererErrorBoundaryState {
  error?: Error
}

export class RendererErrorBoundary extends Component<
  { children: ReactNode },
  RendererErrorBoundaryState
> {
  state: RendererErrorBoundaryState = {}

  static getDerivedStateFromError(error: Error): RendererErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      `[maximal-client] renderer failed:\n${error.stack ?? error.message}${info.componentStack ?? ''}`,
    )
  }

  render(): ReactNode {
    if (!this.state.error) return this.props.children

    return (
      <main className="renderer-failure" role="alert">
        <div className="renderer-failure__panel">
          <h1>Maximal could not display this window</h1>
          <p>
            The terminal processes are managed outside this view. Reload the window
            to reconnect without restarting the entire application.
          </p>
          <button type="button" onClick={() => window.location.reload()}>
            Reload Window
          </button>
        </div>
      </main>
    )
  }
}
