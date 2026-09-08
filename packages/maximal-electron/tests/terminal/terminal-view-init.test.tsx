// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

const ghostty = vi.hoisted(() => ({
  init: vi.fn()
    .mockRejectedValueOnce(new Error('WASM unavailable'))
    .mockResolvedValue(undefined),
  open: vi.fn(),
}));

vi.mock('ghostty-web', () => ({
  init: ghostty.init,
  FitAddon: class {
    fit(): void {}
  },
  Terminal: class {
    readonly cols = 80;
    readonly rows = 24;
    loadAddon(): void {}
    open(): void {
      ghostty.open();
    }
    focus(): void {}
    onData(): void {}
    onResize(): void {}
    attachCustomKeyEventHandler(): void {}
    onTitleChange(): void {}
    write(): void {}
    dispose(): void {}
  },
}));

import { TerminalView } from '../../src/renderer/components/TerminalView.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
};

describe('TerminalView initialization', () => {
  it('reports a failed shared WASM load and retries from a clean promise', async () => {
    const transport = {
      spawn: vi.fn(async () => undefined),
      write: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      terminate: vi.fn(async () => undefined),
      subscribe: vi.fn(() => () => undefined),
    };
    const element = document.createElement('div');
    const root = createRoot(element);

    await act(async () => {
      root.render(<TerminalView id="session-1" transport={transport} />);
    });

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Terminal could not start.',
    );
    expect(transport.spawn).not.toHaveBeenCalled();

    await act(async () => {
      (element.querySelector('button') as HTMLButtonElement).click();
    });

    expect(ghostty.init).toHaveBeenCalledTimes(2);
    expect(ghostty.open).toHaveBeenCalledOnce();
    expect(transport.spawn).toHaveBeenCalledOnce();
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(transport.terminate).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    expect(transport.terminate).toHaveBeenCalledOnce();
  });
});