import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Defines the `--shell-*` custom properties the shell stylesheet reads; that
// package ships no palette by design. Imported first so the tokens exist
// before first paint.
import '@maximal/maximal-client/renderer/theme'
import '@maximal/maximal-client/renderer/base'
import '@maximal/maximal-electron/renderer/styles.css'
import '@maximal/maximal-observability/styles.css'

import { App } from './App'
import { RendererErrorBoundary } from './RendererErrorBoundary'

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <RendererErrorBoundary>
        <App />
      </RendererErrorBoundary>
    </StrictMode>,
  )
}
