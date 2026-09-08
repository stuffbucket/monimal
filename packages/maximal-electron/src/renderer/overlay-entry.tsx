import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';

import { Overlay } from './overlay.js';

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    <Overlay />
  </StrictMode>,
);