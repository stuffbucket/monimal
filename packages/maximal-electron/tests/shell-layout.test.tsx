// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { ShellLayout } from '../src/renderer/components/ShellLayout.js';

const resizeObservers = new Set<TestResizeObserver>();

class TestResizeObserver implements ResizeObserver {
  readonly #targets = new Set<Element>();

  constructor(private readonly callback: ResizeObserverCallback) {
    resizeObservers.add(this);
  }

  observe(target: Element): void {
    this.#targets.add(target);
  }

  unobserve(target: Element): void {
    this.#targets.delete(target);
  }

  disconnect(): void {
    this.#targets.clear();
    resizeObservers.delete(this);
  }

  flush(): void {
    const entries = [...this.#targets].map(
      (target) => ({ target, borderBoxSize: [{}] }) as unknown as ResizeObserverEntry,
    );
    this.callback(entries, this);
  }
}

globalThis.ResizeObserver = TestResizeObserver;
Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
Object.defineProperties(HTMLElement.prototype, {
  offsetWidth: { configurable: true, get: () => 800 },
  offsetHeight: { configurable: true, get: () => 600 },
});

function flushResizeObservers(): void {
  for (const observer of resizeObservers) observer.flush();
}

afterEach(() => {
  document.body.replaceChildren();
  localStorage.clear();
  resizeObservers.clear();
});

describe('ShellLayout panel topology', () => {
  it('ignores a persisted layout whose panels do not match the current topology', () => {
    localStorage.setItem(
      'react-resizable-panels:topology-test:tab:terminal:neither:main',
      JSON.stringify({ left: 17.826, main: 82.174 }),
    );
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);

    act(() => root.render(
      <ShellLayout
        layoutId="topology-test"
        tabs={[{ id: 'terminal', title: 'Terminal' }]}
        activeTab="terminal"
        onSelectTab={() => undefined}
        main={<div>content</div>}
      />,
    ));

    expect(container.textContent).toContain('content');
    act(() => root.unmount());
  });

  it('isolates persisted layouts when a document loses its left panel', () => {
    const container = document.createElement('div');
    document.body.append(container);
    const root = createRoot(container);
    const common = {
      layoutId: 'topology-test',
      tabs: [{ id: 'terminal', title: 'Terminal' }],
      activeTab: 'terminal',
      onSelectTab: () => undefined,
      main: <div>content</div>,
    };

    act(() => root.render(
      <ShellLayout
        {...common}
        left={() => <nav>Sidebar</nav>}
      />,
    ));
    act(() => flushResizeObservers());
    expect(container.textContent).toContain('Sidebar');

    act(() => root.render(<ShellLayout {...common} />));
    act(() => flushResizeObservers());
    expect(container.textContent).toContain('content');
    expect(container.textContent).not.toContain('Sidebar');
    act(() => root.unmount());
  });
});
