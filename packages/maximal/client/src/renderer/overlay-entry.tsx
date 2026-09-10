import '@stuffbucket/maximal-harness/styles.css'
import './theme.js'

import { Overlay } from '@stuffbucket/maximal-harness/renderer'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import { harnessTransport } from './harness/transport.js'

const container = document.getElementById('root')
if (!container) throw new Error('Missing #root')

createRoot(container).render(
  <StrictMode>
    <Overlay transport={harnessTransport} />
  </StrictMode>,
)
