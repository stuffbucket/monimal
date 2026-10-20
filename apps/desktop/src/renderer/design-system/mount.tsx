import { StrictMode, type ReactElement } from 'react'
import { createRoot } from 'react-dom/client'

import '@maximal/maximal-design-system/tokens.css'
import '@maximal/maximal-design-system/styles.css'
import '@maximal/maximal-design-system/app.css'

import { REFERENCE_PALETTE_SEEDS, createThemeManager } from '@maximal/maximal-design-system'
import { MaximalQueryProvider } from '@maximal/maximal-client/renderer/query-client'

import { RendererErrorBoundary } from '../workspace/RendererErrorBoundary'

/** Mounts a renderer drawn only from `@maximal/maximal-design-system` stylesheets. */
export function mountDesignSystemRenderer(app: ReactElement): void {
  createThemeManager().setTheme({ appearance: 'system', colors: REFERENCE_PALETTE_SEEDS })
  const root = document.getElementById('root')
  if (!root) return
  createRoot(root).render(
    <StrictMode>
      <RendererErrorBoundary>
        <MaximalQueryProvider>{app}</MaximalQueryProvider>
      </RendererErrorBoundary>
    </StrictMode>,
  )
}
