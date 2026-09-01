import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

// Defines the `--shell-*` custom properties the shell stylesheet reads; that
// package ships no palette by design. Imported first so the tokens exist
// before first paint.
import './theme'
import 'stuffbucket-electron/renderer/styles.css'

import { App } from './App'

const root = document.getElementById('root')
if (root) {
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}
