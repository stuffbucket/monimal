import '@maximal/maximal-harness/styles.css'
import '@maximal/maximal-client/renderer/theme'

import { Overlay } from '@maximal/maximal-harness/renderer'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { harnessTransport } from '@maximal/maximal-client/renderer/harness/transport'

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root')

createRoot(container).render(
  <StrictMode>
    <Overlay transport={harnessTransport} />
  </StrictMode>,
)
