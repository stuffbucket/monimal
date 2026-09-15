import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import '@wterm/dom/css';
import '@xterm/xterm/css/xterm.css';
import '../renderer/styles/shell.css';
import './terminal-lab.css';

import { TerminalLab } from './TerminalLab.js';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    <TerminalLab />
  </StrictMode>,
);