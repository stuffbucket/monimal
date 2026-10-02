// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  AppFrame,
  Status,
  StatusProvider,
  StatusViewport,
  SurfaceActivity,
  SurfaceRail,
  SurfaceRight,
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
        withActivity
        withLeft
        withRight
      >
        <IdentityProbe />
        <SurfaceTop><p data-testid="top">top</p></SurfaceTop>
        <SurfaceActivity><p data-testid="activity">activity</p></SurfaceActivity>
        <SurfaceRail>{(collapsed) => <p data-testid="rail">{String(collapsed)}</p>}</SurfaceRail>
        <SurfaceRight><p data-testid="right">right</p></SurfaceRight>
        <Status id="status" dismissible={false}><p data-testid="status">status</p></Status>
      </AppFrame>,
    );

    expect(shell.querySelector('[data-testid="top"]')?.parentElement?.className)
      .toContain('app-frame__slot');
    expect(shell.querySelector('.activity-rail [data-testid="activity"]')).not.toBeNull();
    expect(shell.querySelector('#left [data-testid="rail"]')?.textContent).toBe('false');
    expect(shell.querySelector('#right [data-testid="right"]')).not.toBeNull();
    expect(shell.querySelector('.statusbar [data-testid="status"]')).not.toBeNull();
    expect(shell.querySelector('[data-testid="ids"]')?.textContent).toBe(
      'consumer-documents-tab-document consumer-documents-tabpanel-document',
    );

    const toggleLeft = shell.querySelector<HTMLButtonElement>('[data-testid="toggle-left"]');
    act(() => toggleLeft?.click());

    expect(toggleLeft?.getAttribute('aria-label')).toBe('Show sidebar');
    expect(shell.querySelector('#left [data-testid="rail"]')?.textContent).toBe('true');
    expect(shell.querySelector('.activity-rail [data-testid="activity"]')).not.toBeNull();
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
    expect(shell.querySelector('.activity-rail')).toBeNull();
    expect(shell.querySelector('#right')).toBeNull();
    expect(shell.querySelector('.statusbar')).toBeNull();
  });

  it('orders, pages, and dismisses registered statuses', () => {
    const shell = render(
      <AppFrame
        layoutId="consumer"
        tabs={[{ id: 'document', title: 'Document' }]}
        activeTab="document"
        onSelectTab={vi.fn()}
      >
        <Status id="later" order={20}><span>Later</span></Status>
        <Status id="first" order={10} dismissible={false}><span>First</span></Status>
      </AppFrame>,
    );

    expect(shell.querySelector('.status-viewport__content')?.textContent).toBe('First');
    expect(shell.querySelector('[aria-label="Dismiss status"]')).toBeNull();
    expect(shell.querySelector('.status-viewport__position')?.textContent).toBe('1 / 2');

    act(() => {
      shell.querySelector<HTMLButtonElement>('[aria-label="Next status"]')?.click();
    });
    expect(shell.querySelector('.status-viewport__content')?.textContent).toBe('Later');
    expect(shell.querySelector('[aria-label="Dismiss status"]')).not.toBeNull();

    act(() => {
      shell.querySelector<HTMLButtonElement>('[aria-label="Dismiss status"]')?.click();
    });
    expect(shell.querySelector('.status-viewport__content')?.textContent).toBe('First');
    expect(shell.querySelector('.status-viewport__position')).toBeNull();
  });
});

describe('StatusProvider', () => {
  it('supports a viewport outside AppFrame', () => {
    const shell = render(
      <StatusProvider>
        <Status id="standalone" dismissible={false}>Standalone banner</Status>
        <StatusViewport />
      </StatusProvider>,
    );

    expect(shell.querySelector('.status-viewport__content')?.textContent)
      .toBe('Standalone banner');
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