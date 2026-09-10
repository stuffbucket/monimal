// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

const ghostty = vi.hoisted(() => ({
  create: vi.fn(),
  kind: undefined as string | undefined,
  open: vi.fn()
    .mockRejectedValueOnce(new Error('emulator unavailable'))
    .mockResolvedValue(undefined),
}));

vi.mock('../../src/renderer/lib/terminal-emulator.js', () => ({
  createTerminalEmulator: ghostty.create
    .mockImplementation((kind: string) => {
      ghostty.kind = kind;
      return ({
    cols: 80,
    rows: 24,
    buffer: { active: {} },
    async open(): Promise<void> {
      await ghostty.open();
    },
    fit(): void {},
    focus(): void {},
    blur(): void {},
    onData(): { dispose(): void } { return { dispose() {} }; },
    onResize(): { dispose(): void } { return { dispose() {} }; },
    onKeyEvent(): void {},
    onTitleChange(): { dispose(): void } { return { dispose() {} }; },
    write(): void {},
    dispose(): void {},
      });
    }),
}));

import { TerminalView } from '../../src/renderer/components/TerminalView.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
};

describe('TerminalView initialization', () => {
  it('reports a failed emulator start and retries with a new instance', async () => {
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
      root.render(<TerminalView id="session-1" emulator="ghostty" transport={transport} />);
    });

    expect(element.querySelector('[role="alert"]')?.textContent).toContain(
      'Terminal could not start.',
    );
    expect(transport.spawn).not.toHaveBeenCalled();

    await act(async () => {
      (element.querySelector('button') as HTMLButtonElement).click();
    });

    expect(ghostty.create).toHaveBeenCalledTimes(2);
    expect(ghostty.kind).toBe('ghostty');
    expect(ghostty.open).toHaveBeenCalledTimes(2);
    expect(transport.spawn).toHaveBeenCalledOnce();
    expect(element.querySelector('[role="alert"]')).toBeNull();
    expect(transport.terminate).not.toHaveBeenCalled();

    await act(async () => root.unmount());
    expect(transport.terminate).toHaveBeenCalledOnce();
  });
});