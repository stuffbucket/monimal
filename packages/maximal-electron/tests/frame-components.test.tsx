// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AppFrame,
  SurfaceRail,
  SurfaceRight,
  SurfaceStatus,
  SurfaceTop,
  WindowChrome,
  useTabPanelId,
  useTabTriggerId,
} from '../src/renderer/index.js';

globalThis.ResizeObserver = class {
  observe(): void {}
  unobserve(): void {}
  disconnect(): void {}
};
Object.defineProperties(HTMLElement.prototype, {
  offsetWidth: { configurable: true, get: () => 400 },
  offsetHeight: { configurable: true, get: () => 300 },
});
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function render(children: ReactNode): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => root?.render(children));
  return container;
}

describe('AppFrame', () => {
  it('routes surface content into caller-selected shell regions', () => {
    function IdentityProbe() {
      return <p data-testid="ids">{useTabTriggerId()} {useTabPanelId()}</p>;
    }

    const shell = render(
      <AppFrame
        layoutId="consumer"
        tabs={[{ id: 'document', title: 'Document' }]}
        activeTab="document"
        onSelectTab={vi.fn()}
        withLeft
        withRight
        withStatus
      >
        <IdentityProbe />
        <SurfaceTop><p data-testid="top">top</p></SurfaceTop>
        <SurfaceRail>{(collapsed) => <p data-testid="rail">{String(collapsed)}</p>}</SurfaceRail>
        <SurfaceRight><p data-testid="right">right</p></SurfaceRight>
        <SurfaceStatus><p data-testid="status">status</p></SurfaceStatus>
      </AppFrame>,
    );

    expect(shell.querySelector('[data-testid="top"]')?.parentElement?.className)
      .toContain('app-frame__slot');
    expect(shell.querySelector('#left [data-testid="rail"]')?.textContent).toBe('false');
    expect(shell.querySelector('#right [data-testid="right"]')).not.toBeNull();
    expect(shell.querySelector('.statusbar [data-testid="status"]')).not.toBeNull();
    expect(shell.querySelector('[data-testid="ids"]')?.textContent).toBe(
      'consumer-documents-tab-document consumer-documents-tabpanel-document',
    );
  });

  it('omits optional regions until the caller selects them', () => {
    const shell = render(
      <AppFrame
        layoutId="consumer"
        tabs={[{ id: 'document', title: 'Document' }]}
        activeTab="document"
        onSelectTab={vi.fn()}
      >
        content
      </AppFrame>,
    );

    expect(shell.querySelector('#left')).toBeNull();
    expect(shell.querySelector('#right')).toBeNull();
    expect(shell.querySelector('.statusbar')).toBeNull();
  });
});

describe('WindowChrome', () => {
  it('renders one named document in draggable package chrome', () => {
    const shell = render(
      <WindowChrome
        layoutId="welcome"
        tab={{ id: 'start', title: 'Start' }}
        tabsLabel="Welcome"
      >
        <p data-testid="content">content</p>
      </WindowChrome>,
    );

    expect(shell.querySelectorAll('[role="tab"]')).toHaveLength(1);
    expect(shell.querySelector('[role="tab"]')?.textContent).toBe('Start');
    expect(shell.querySelector('[role="tabpanel"]')?.getAttribute('aria-labelledby'))
      .toBe('welcome-documents-tab-start');
    expect(shell.querySelector('.window-chrome__panel [data-testid="content"]')).not.toBeNull();
  });
});