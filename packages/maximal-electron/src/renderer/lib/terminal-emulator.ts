import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import type { ITheme } from '@xterm/xterm';
import { WTerm } from '@wterm/dom';
import { GhosttyCore } from '@wterm/ghostty';
import ghosttyWasmUrl from '@wterm/ghostty/ghostty-vt.wasm?url&inline';

import { OscTitleObserver } from './osc-title.js';

export type TerminalTheme = ITheme;
export type TerminalEmulatorKind = 'xterm' | 'ghostty';

export interface GhosttyWindowAdjustment {
  /** Horizontal content padding in CSS pixels. */
  paddingX?: number;
  /** Vertical content padding in CSS pixels. */
  paddingY?: number;
  /** Keep the configured padding equal on opposing edges. */
  balance?: boolean;
  /** Terminal background opacity from 0 through 1. Text remains opaque. */
  opacity?: number;
  /** Backdrop blur radius in CSS pixels. Zero disables blur. */
  blur?: number;
}

interface TerminalDisposable {
  dispose(): void;
}

interface TerminalBufferLine {
  translateToString(trimRight?: boolean, startColumn?: number, endColumn?: number): string;
}

interface TerminalBuffer {
  readonly length: number;
  getLine(index: number): TerminalBufferLine | undefined;
}

export interface TerminalEmulator {
  readonly cols: number;
  readonly rows: number;
  readonly buffer: { readonly active: TerminalBuffer };
  open(element: HTMLElement): Promise<void>;
  fit(): void;
  focus(): void;
  blur(): void;
  onData(listener: (data: string) => void): TerminalDisposable;
  onResize(listener: (size: { cols: number; rows: number }) => void): TerminalDisposable;
  onKeyEvent(listener: (event: KeyboardEvent) => boolean): void;
  onTitleChange(listener: (title: string) => void): TerminalDisposable;
  write(data: string, callback?: () => void): void;
  clear(): void;
  selectAll(): void;
  scrollToTop(): void;
  scrollToBottom(): void;
  dispose(): void;
}

function createXtermEmulator(theme?: TerminalTheme): TerminalEmulator {
  const terminal = new Terminal({
    cursorBlink: true,
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    fontSize: 13,
    minimumContrastRatio: 4.5,
    ...(theme ? { theme } : {}),
  });
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);

  return {
    get cols() { return terminal.cols; },
    get rows() { return terminal.rows; },
    get buffer() { return terminal.buffer; },
    open: (element) => {
      if (theme?.foreground) element.style.color = theme.foreground;
      if (theme?.background) element.style.backgroundColor = theme.background;
      return Promise.resolve(terminal.open(element));
    },
    fit: () => fitAddon.fit(),
    focus: () => terminal.focus(),
    blur: () => terminal.blur(),
    onData: (listener) => terminal.onData(listener),
    onResize: (listener) => terminal.onResize(listener),
    onKeyEvent: (listener) => {
      terminal.attachCustomKeyEventHandler((event) => !listener(event));
    },
    onTitleChange: (listener) => terminal.onTitleChange(listener),
    write: (data, callback) => terminal.write(data, callback),
    clear: () => terminal.clear(),
    selectAll: () => terminal.selectAll(),
    scrollToTop: () => terminal.scrollToTop(),
    scrollToBottom: () => terminal.scrollToBottom(),
    dispose: () => terminal.dispose(),
  };
}

function bounded(value: number | undefined, fallback: number, maximum: number): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(0, value!)) : fallback;
}

function applyGhosttyWindow(
  host: HTMLElement,
  theme: TerminalTheme | undefined,
  adjustment: GhosttyWindowAdjustment | undefined,
): void {
  if (!adjustment) return;
  const paddingX = bounded(adjustment.paddingX, 0, 64);
  const paddingY = bounded(adjustment.paddingY, 0, 64);
  const opacity = bounded(adjustment.opacity, 1, 1);
  const blur = bounded(adjustment.blur, 0, 64);
  const background = theme?.background ?? '#1e1e1e';

  host.style.boxSizing = 'border-box';
  host.style.padding = `${String(paddingY)}px ${String(paddingX)}px`;
  host.style.setProperty(
    '--term-bg',
    opacity === 1
      ? background
      : `color-mix(in srgb, ${background} ${String(opacity * 100)}%, transparent)`,
  );
  host.style.backdropFilter = blur === 0 ? 'none' : `blur(${String(blur)}px)`;
  host.dataset.ghosttyPaddingBalance = String(adjustment.balance ?? false);
}

async function createGhosttyEmulator(
  theme?: TerminalTheme,
  windowAdjustment?: GhosttyWindowAdjustment,
): Promise<TerminalEmulator> {
  const core = await GhosttyCore.load({
    wasmPath: ghosttyWasmUrl,
    ...(theme?.foreground ? { foregroundColor: theme.foreground } : {}),
    ...(theme?.background ? { backgroundColor: theme.background } : {}),
  });
  let terminal: WTerm | undefined;
  let element: HTMLElement | undefined;
  let keyListener: ((event: KeyboardEvent) => boolean) | undefined;
  let suppressedKeyInput: string | undefined;
  const handleKeyEvent = (event: KeyboardEvent) => {
    if (!keyListener?.(event)) return;
    suppressedKeyInput = event.key;
    event.preventDefault();
    event.stopPropagation();
  };
  const handleKeyUp = (event: KeyboardEvent) => {
    if (event.key === suppressedKeyInput) suppressedKeyInput = undefined;
  };
  const handleInput = (event: Event) => {
    if (suppressedKeyInput === undefined) return;
    event.stopPropagation();
    if (event.target instanceof HTMLTextAreaElement) event.target.value = '';
    suppressedKeyInput = undefined;
  };
  const dataListeners = new Set<(data: string) => void>();
  const resizeListeners = new Set<(size: { cols: number; rows: number }) => void>();
  const titleListeners = new Set<(title: string) => void>();
  let lastTitle: string | undefined;
  const emitTitle = (title: string) => {
    if (title === lastTitle) return;
    lastTitle = title;
    titleListeners.forEach((listener) => listener(title));
  };
  const titleObserver = new OscTitleObserver(emitTitle);

  const activeBuffer = (): TerminalBuffer => {
    const bridge = terminal?.bridge;
    const scrollback = bridge?.getScrollbackCount() ?? 0;
    const rows = terminal?.rows ?? 0;
    return {
      length: scrollback + rows,
      getLine(index) {
        if (!bridge || index < 0 || index >= scrollback + rows) return undefined;
        return {
          translateToString(trimRight = false) {
            const isScrollback = index < scrollback;
            const columns = isScrollback
              ? bridge.getScrollbackLineLen(index)
              : terminal?.cols ?? 0;
            let value = '';
            Array.from({ length: columns }, (_, column) => {
              const cell = isScrollback
                ? bridge.getScrollbackCell(index, column)
                : bridge.getCell(index - scrollback, column);
              if (cell.width !== 0) value += cell.chars ?? String.fromCodePoint(cell.char);
            });
            return trimRight ? value.trimEnd() : value;
          },
        };
      },
    };
  };

  function disposeListener<T>(listeners: Set<T>, listener: T): TerminalDisposable {
    listeners.add(listener);
    return { dispose: () => listeners.delete(listener) };
  }

  return {
    get cols() { return terminal?.cols ?? 80; },
    get rows() { return terminal?.rows ?? 24; },
    get buffer() { return { active: activeBuffer() }; },
    open: async (host) => {
      element = host;
      if (theme?.foreground) host.style.setProperty('--term-fg', theme.foreground);
      if (theme?.background && !windowAdjustment) host.style.setProperty('--term-bg', theme.background);
      if (theme?.cursor) host.style.setProperty('--term-cursor', theme.cursor);
      applyGhosttyWindow(host, theme, windowAdjustment);
      host.addEventListener('keydown', handleKeyEvent, { capture: true });
      host.addEventListener('keyup', handleKeyUp, { capture: true });
      host.addEventListener('input', handleInput, { capture: true });
      terminal = new WTerm(host, {
        core,
        cursorBlink: true,
        onData: (data) => {
          dataListeners.forEach((listener) => listener(data));
        },
        onResize: (cols, rows) => resizeListeners.forEach((listener) => listener({ cols, rows })),
        onTitle: emitTitle,
      });
      await terminal.init();
    },
    fit: () => {},
    focus: () => terminal?.focus(),
    blur: () => {
      element?.querySelector('textarea')?.blur();
      element?.blur();
    },
    onData: (listener) => disposeListener(dataListeners, listener),
    onResize: (listener) => disposeListener(resizeListeners, listener),
    onKeyEvent: (listener) => { keyListener = listener; },
    onTitleChange: (listener) => disposeListener(titleListeners, listener),
    write: (data, callback) => {
      titleObserver.write(data);
      terminal?.write(data);
      if (callback) requestAnimationFrame(callback);
    },
    clear: () => terminal?.write('\x1b[2J\x1b[H'),
    selectAll: () => {
      if (!element) return;
      const selection = window.getSelection();
      const range = document.createRange();
      range.selectNodeContents(element);
      selection?.removeAllRanges();
      selection?.addRange(range);
    },
    scrollToTop: () => { if (element) element.scrollTop = 0; },
    scrollToBottom: () => { if (element) element.scrollTop = element.scrollHeight; },
    dispose: () => {
      element?.removeEventListener('keydown', handleKeyEvent, { capture: true });
      element?.removeEventListener('keyup', handleKeyUp, { capture: true });
      element?.removeEventListener('input', handleInput, { capture: true });
      terminal?.destroy();
      core.dispose();
    },
  };
}

export async function createTerminalEmulator(
  kind: TerminalEmulatorKind = 'xterm',
  theme?: TerminalTheme,
  ghosttyWindow?: GhosttyWindowAdjustment,
): Promise<TerminalEmulator> {
  return kind === 'ghostty'
    ? createGhosttyEmulator(theme, ghosttyWindow)
    : createXtermEmulator(theme);
}
