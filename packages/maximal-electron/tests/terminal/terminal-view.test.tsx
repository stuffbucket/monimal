// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

const ghostty = vi.hoisted(() => ({
  keyHandler: undefined as ((event: KeyboardEvent) => boolean) | undefined,
  titleHandler: undefined as ((title: string) => void) | undefined,
  clear: vi.fn(),
  selectAll: vi.fn(),
  scrollToTop: vi.fn(),
  scrollToBottom: vi.fn(),
  focus: vi.fn(),
  blur: vi.fn(),
  subscription: undefined as ((event: { type: 'exit'; exitCode: number }) => void) | undefined,
}));

vi.mock('ghostty-web', () => ({
  init: vi.fn(async () => undefined),
  FitAddon: class {
    fit(): void {}
  },
  Terminal: class {
    readonly cols = 80;
    readonly rows = 24;
    loadAddon(): void {}
    open(): void {}
    onData(): void {}
    onResize(): void {}
    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void {
      ghostty.keyHandler = handler;
    }
    clear(): void { ghostty.clear(); }
    selectAll(): void { ghostty.selectAll(); }
    scrollToTop(): void { ghostty.scrollToTop(); }
    scrollToBottom(): void { ghostty.scrollToBottom(); }
    focus(): void { ghostty.focus(); }
    blur(): void { ghostty.blur(); }
    onTitleChange(handler: (title: string) => void): void {
      ghostty.titleHandler = handler;
    }
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

describe('TerminalView lifecycle', () => {
  it('keeps the session through a StrictMode remount and terminates it on real unmount', async () => {
    const terminate = vi.fn(async () => undefined);
    const transport = {
      spawn: vi.fn(async () => undefined),
      write: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      terminate,
      subscribe: vi.fn(() => () => undefined),
    };
    const element = document.createElement('div');
    const root = createRoot(element);

    await act(async () => {
      root.render(
        <StrictMode>
          <TerminalView id="session-1" transport={transport} />
        </StrictMode>,
      );
    });

    expect(terminate).not.toHaveBeenCalled();
    expect(ghostty.keyHandler?.(
      new KeyboardEvent('keydown', { key: 'd', metaKey: true }),
    )).toBe(false);

    await act(async () => root.unmount());

    expect(terminate).toHaveBeenCalledOnce();
    expect(terminate).toHaveBeenCalledWith('session-1');
  });

  it('maps Ghostty split shortcuts and forwards terminal titles', async () => {
    const onSplit = vi.fn();
    const onNavigateSplit = vi.fn();
    const onTitleChange = vi.fn();
    const transport = {
      spawn: vi.fn(async () => undefined),
      write: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      terminate: vi.fn(async () => undefined),
      subscribe: vi.fn(() => () => undefined),
    };
    const root = createRoot(document.createElement('div'));

    await act(async () => {
      root.render(
        <TerminalView
          id="session-1"
          transport={transport}
          onSplit={onSplit}
          onNavigateSplit={onNavigateSplit}
          onTitleChange={onTitleChange}
        />,
      );
    });

    expect(ghostty.keyHandler?.(new KeyboardEvent('keydown', { key: 'd' }))).toBe(false);
    expect(ghostty.keyHandler?.(new KeyboardEvent('keydown', { key: 'd', metaKey: true }))).toBe(true);
    expect(ghostty.keyHandler?.(new KeyboardEvent('keydown', { key: 'D', metaKey: true, shiftKey: true }))).toBe(true);
    expect(ghostty.keyHandler?.(new KeyboardEvent('keyup', { key: 'd', metaKey: true }))).toBe(false);
    expect(onSplit.mock.calls).toEqual([['right'], ['down']]);

    expect(ghostty.keyHandler?.(new KeyboardEvent('keydown', { key: '[', metaKey: true }))).toBe(true);
    expect(ghostty.keyHandler?.(new KeyboardEvent('keydown', { key: ']', metaKey: true }))).toBe(true);
    expect(onNavigateSplit.mock.calls).toEqual([['previous'], ['next']]);

    expect(ghostty.keyHandler?.(new KeyboardEvent('keydown', { key: 'k', metaKey: true }))).toBe(true);
    expect(ghostty.keyHandler?.(new KeyboardEvent('keydown', { key: 'a', metaKey: true }))).toBe(true);
    expect(ghostty.keyHandler?.(new KeyboardEvent('keydown', { key: 'Home', metaKey: true }))).toBe(true);
    expect(ghostty.keyHandler?.(new KeyboardEvent('keydown', { key: 'End', metaKey: true }))).toBe(true);
    expect(ghostty.clear).toHaveBeenCalledOnce();
    expect(ghostty.selectAll).toHaveBeenCalledOnce();
    expect(ghostty.scrollToTop).toHaveBeenCalledOnce();
    expect(ghostty.scrollToBottom).toHaveBeenCalledOnce();

    ghostty.titleHandler?.('vim README.md');
    expect(onTitleChange).toHaveBeenCalledWith('vim README.md');

    await act(async () => root.unmount());
  });

  it('focuses an active pane and forwards process exit', async () => {
    const onExit = vi.fn();
    const transport = {
      spawn: vi.fn(async () => undefined),
      write: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      terminate: vi.fn(async () => undefined),
      subscribe: vi.fn((_id: string, listener: typeof ghostty.subscription) => {
        ghostty.subscription = listener;
        return () => undefined;
      }),
    };
    const element = document.createElement('div');
    const root = createRoot(element);

    await act(async () => {
      root.render(
        <TerminalView id="session-1" focused onExit={onExit} transport={transport} />,
      );
    });
    expect(ghostty.focus).toHaveBeenCalled();
    expect(element.querySelector('.terminal')?.getAttribute('data-focused')).toBe('true');

    await act(async () => ghostty.subscription?.({ type: 'exit', exitCode: 7 }));
    expect(onExit).toHaveBeenCalledWith(7);

    await act(async () => root.unmount());
  });

  it('blurs an inactive pane and claims focus on pointer down', async () => {
    const onFocus = vi.fn();
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
      root.render(
        <TerminalView id="session-1" focused={false} onFocus={onFocus} transport={transport} />,
      );
    });
    expect(ghostty.blur).toHaveBeenCalled();

    element.querySelector('.terminal')?.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true }),
    );
    expect(onFocus).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });
});