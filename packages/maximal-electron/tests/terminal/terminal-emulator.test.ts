// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const xterm = vi.hoisted(() => {
  const addon: unknown = undefined;
  const options: unknown = undefined;
  return {
    addon,
    fit: vi.fn(),
    keyHandler: undefined as ((event: KeyboardEvent) => boolean) | undefined,
    options,
  };
});

const ghostty = vi.hoisted(() => {
  const coreOptions: unknown = undefined;
  return {
    core: { name: 'ghostty-core' },
    coreOptions,
    dataHandler: undefined as ((data: string) => void) | undefined,
    destroy: vi.fn(),
    init: vi.fn(async () => undefined),
    options: undefined as { onData?: (data: string) => void } | undefined,
    textarea: undefined as HTMLTextAreaElement | undefined,
    write: vi.fn(),
  };
});

vi.mock('@xterm/addon-fit', () => ({
  FitAddon: class {
    fit(): void { xterm.fit(); }
  },
}));

vi.mock('@xterm/xterm', () => ({
  Terminal: class {
    readonly cols = 80;
    readonly rows = 24;
    readonly buffer = { active: {} };
    constructor(options: unknown) { xterm.options = options; }
    loadAddon(addon: unknown): void { xterm.addon = addon; }
    open(): void {}
    focus(): void {}
    blur(): void {}
    onData(): { dispose(): void } { return { dispose() {} }; }
    onResize(): { dispose(): void } { return { dispose() {} }; }
    attachCustomKeyEventHandler(handler: (event: KeyboardEvent) => boolean): void {
      xterm.keyHandler = handler;
    }
    onTitleChange(): { dispose(): void } { return { dispose() {} }; }
    write(): void {}
    clear(): void {}
    selectAll(): void {}
    scrollToTop(): void {}
    scrollToBottom(): void {}
    dispose(): void {}
  },
}));

vi.mock('@wterm/ghostty', () => ({
  GhosttyCore: class {
    static async load(options: unknown): Promise<unknown> {
      ghostty.coreOptions = options;
      return ghostty.core;
    }
  },
}));

vi.mock('@wterm/dom', () => ({
  WTerm: class {
    readonly cols = 80;
    readonly rows = 24;
    readonly bridge = null;
    constructor(_host: HTMLElement, options: { onData?: (data: string) => void }) {
      const textarea = document.createElement('textarea');
      textarea.addEventListener('input', () => options.onData?.(textarea.value));
      _host.appendChild(textarea);
      ghostty.options = options;
      ghostty.dataHandler = options.onData;
      ghostty.textarea = textarea;
    }
    async init(): Promise<void> { await ghostty.init(); }
    focus(): void {}
    write(data: string): void { ghostty.write(data); }
    destroy(): void { ghostty.destroy(); }
  },
}));

import { createTerminalEmulator } from '../../src/renderer/lib/terminal-emulator.js';

describe('terminal emulator adapter', () => {
  beforeEach(() => vi.clearAllMocks());

  it('owns xterm construction and fit behavior', async () => {
    const emulator = await createTerminalEmulator('xterm', {
      background: '#101216',
      foreground: '#e6e8ec',
    });

    expect(xterm.options).toMatchObject({
      cursorBlink: true,
      fontSize: 13,
      minimumContrastRatio: 4.5,
      theme: { background: '#101216', foreground: '#e6e8ec' },
    });
    expect(xterm.addon).toBeDefined();
    const host = document.createElement('div');
    await emulator.open(host);
    expect(host.style.backgroundColor).toBe('rgb(16, 18, 22)');
    expect(host.style.color).toBe('rgb(230, 232, 236)');
    emulator.fit();
    expect(xterm.fit).toHaveBeenCalledOnce();
  });

  it('normalizes handled key events to xterm prevent-default semantics', async () => {
    const emulator = await createTerminalEmulator();
    emulator.onKeyEvent((event) => event.key === 'd');

    expect(xterm.keyHandler?.({ key: 'd' } as KeyboardEvent)).toBe(false);
    expect(xterm.keyHandler?.({ key: 'x' } as KeyboardEvent)).toBe(true);
  });

  it('loads Ghostty into wterm when selected', async () => {
    const emulator = await createTerminalEmulator(
      'ghostty',
      { foreground: '#eef0f4', background: '#101216' },
      { paddingX: 8, paddingY: 6, balance: true, opacity: 0.8, blur: 4 },
    );
    emulator.onKeyEvent((event) => event.key === 'd');
    const onData = vi.fn();
    emulator.onData(onData);
    const host = document.createElement('div');
    await emulator.open(host);

    const handled = new KeyboardEvent('keydown', { key: 'd', cancelable: true });
    const unhandled = new KeyboardEvent('keydown', { key: 'x', cancelable: true });
    ghostty.textarea?.dispatchEvent(handled);
    if (ghostty.textarea) ghostty.textarea.value = '\x04';
    ghostty.textarea?.dispatchEvent(new InputEvent('input', { bubbles: true }));
    expect(onData).not.toHaveBeenCalled();
    ghostty.dataHandler?.('\x04');
    ghostty.textarea?.dispatchEvent(unhandled);

    expect(ghostty.coreOptions).toEqual({
      foregroundColor: '#eef0f4',
      backgroundColor: '#101216',
    });
    expect(ghostty.init).toHaveBeenCalledOnce();
    expect(ghostty.options).toMatchObject({
      core: ghostty.core,
      cursorBlink: true,
    });
    expect(host.style.getPropertyValue('--term-fg')).toBe('#eef0f4');
    expect(host.style.getPropertyValue('--term-bg')).toBe(
      'color-mix(in srgb, #101216 80%, transparent)',
    );
    expect(host.style.padding).toBe('6px 8px');
    expect(host.style.boxSizing).toBe('border-box');
    expect(host.style.backdropFilter).toBe('blur(4px)');
    expect(host.dataset.ghosttyPaddingBalance).toBe('true');
    expect(handled.defaultPrevented).toBe(true);
    expect(unhandled.defaultPrevented).toBe(false);
    expect(onData).toHaveBeenCalledOnce();
    expect(onData).toHaveBeenCalledWith('\x04');

    emulator.clear();
    expect(ghostty.write).toHaveBeenCalledWith('\x1b[2J\x1b[H');
    emulator.dispose();
    expect(ghostty.destroy).toHaveBeenCalledOnce();
  });
});