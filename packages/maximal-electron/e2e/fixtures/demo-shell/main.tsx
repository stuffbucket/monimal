import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

// The package's structural stylesheet, which ships no palette by design, and
// then the fixture's own, which defines the `--shell-*` contract it reads.
// A consumer imports these two in this order and nothing else.
import '@stuffbucket/maximal-electron/renderer/styles.css';
import './demo.css';

import { DemoApp } from './DemoApp.js';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    <DemoApp />
  </StrictMode>,
);
