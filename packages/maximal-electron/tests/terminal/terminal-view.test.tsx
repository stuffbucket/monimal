// @vitest-environment jsdom
import { StrictMode, act } from 'react';
import { createRoot } from 'react-dom/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const terminalWrites = vi.hoisted(() => [] as string[]);
const emulatorKinds = vi.hoisted(() => [] as string[]);
const emulatorDisposals = vi.hoisted(() => [] as string[]);

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

vi.mock('../../src/renderer/lib/terminal-emulator.js', () => ({
  createTerminalEmulator: (kind = 'xterm') => {
    emulatorKinds.push(kind);
    return {
    cols: 80,
    rows: 24,
    buffer: { active: {} },
    open(): void {},
    fit(): void {},
    onData(): { dispose(): void } { return { dispose() {} }; },
    onResize(): { dispose(): void } { return { dispose() {} }; },
    onKeyEvent(handler: (event: KeyboardEvent) => boolean): void {
      ghostty.keyHandler = handler;
    },
    clear(): void { ghostty.clear(); },
    selectAll(): void { ghostty.selectAll(); },
    scrollToTop(): void { ghostty.scrollToTop(); },
    scrollToBottom(): void { ghostty.scrollToBottom(); },
    focus(): void { ghostty.focus(); },
    blur(): void { ghostty.blur(); },
    onTitleChange(handler: (title: string) => void): { dispose(): void } {
      ghostty.titleHandler = handler;
      return { dispose() {} };
    },
    write(data: string): void { terminalWrites.push(data); },
    dispose(): void { emulatorDisposals.push(kind); },
    };
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
  beforeEach(() => {
    terminalWrites.length = 0;
    emulatorKinds.length = 0;
    emulatorDisposals.length = 0;
    ghostty.focus.mockClear();
    ghostty.blur.mockClear();
  });

  it('replaces the emulator without terminating the live session', async () => {
    const terminate = vi.fn(async () => undefined);
    const transport = {
      spawn: vi.fn(async () => undefined),
      write: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      terminate,
      subscribe: vi.fn(() => () => undefined),
    };
    const root = createRoot(document.createElement('div'));

    await act(async () => {
      root.render(<TerminalView id="session-1" emulator="ghostty" transport={transport} />);
    });
    await act(async () => {
      root.render(<TerminalView id="session-1" emulator="xterm" transport={transport} />);
    });

    expect(emulatorKinds).toEqual(['ghostty', 'xterm']);
    expect(emulatorDisposals).toEqual(['ghostty']);
    expect(terminate).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    expect(terminate).toHaveBeenCalledWith('session-1');
  });

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

  it('maps terminal split shortcuts and forwards terminal titles', async () => {
    const onSplit = vi.fn((_direction: 'right' | 'down') => undefined);
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
    const splitRight = new KeyboardEvent('keydown', { key: 'd', metaKey: true, cancelable: true });
    onSplit.mockImplementationOnce(() => {
      expect(splitRight.defaultPrevented).toBe(true);
    });
    expect(ghostty.keyHandler?.(splitRight)).toBe(true);
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

  it('consumes an explicit focus request and follows real focus state', async () => {
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
    document.body.append(element);
    const root = createRoot(element);

    await act(async () => {
      root.render(
        <TerminalView id="session-1" focusRequest={1} onExit={onExit} transport={transport} />,
      );
    });
    expect(ghostty.focus).toHaveBeenCalled();
    expect(element.querySelector('.terminal')?.hasAttribute('data-focused')).toBe(false);

    const terminalElement = element.querySelector('.terminal')!;
    const input = document.createElement('input');
    terminalElement.append(input);
    await act(async () => input.focus());
    expect(element.querySelector('.terminal')?.getAttribute('data-focused')).toBe('true');

    await act(async () => window.dispatchEvent(new Event('blur')));
    expect(element.querySelector('.terminal')?.hasAttribute('data-focused')).toBe(false);

    await act(async () => window.dispatchEvent(new Event('focus')));
    expect(element.querySelector('.terminal')?.getAttribute('data-focused')).toBe('true');

    await act(async () => {
      element.querySelector('.terminal')?.dispatchEvent(
        new FocusEvent('focusout', {
          bubbles: true,
          relatedTarget: document.createElement('button'),
        }),
      );
    });
    expect(element.querySelector('.terminal')?.hasAttribute('data-focused')).toBe(false);

    await act(async () => ghostty.subscription?.({ type: 'exit', exitCode: 7 }));
    expect(onExit).toHaveBeenCalledWith(7);

    await act(async () => root.unmount());
    element.remove();
  });

  it('claims pane selection on pointer down without forcing emulator focus', async () => {
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
        <TerminalView id="session-1" onFocus={onFocus} transport={transport} />,
      );
    });
    expect(ghostty.focus).not.toHaveBeenCalled();
    expect(ghostty.blur).not.toHaveBeenCalled();

    element.querySelector('.terminal')?.dispatchEvent(
      new PointerEvent('pointerdown', { bubbles: true }),
    );
    expect(onFocus).toHaveBeenCalledOnce();

    await act(async () => root.unmount());
  });

  it('reports a rejected terminal spawn inside the terminal', async () => {
    const transport = {
      spawn: vi.fn(async () => Promise.reject(new Error('not reserved'))),
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
    expect(transport.terminate).toHaveBeenCalledWith('session-1');

    await act(async () => root.unmount());
  });
});