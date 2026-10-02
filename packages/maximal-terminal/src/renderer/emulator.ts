import { FitAddon } from '@xterm/addon-fit';
import { Terminal } from '@xterm/xterm';
import type { ITheme } from '@xterm/xterm';
import { WTerm } from '@wterm/dom';
import { GhosttyCore } from '@wterm/ghostty';
import ghosttyWasmUrl from '@wterm/ghostty/ghostty-vt.wasm?url&inline';

import type {
  GhosttyWindowAdjustment,
  TerminalPaletteSettings,
} from './appearance.js';
import { OscTitleObserver } from './osc-title.js';

export type { GhosttyWindowAdjustment } from './appearance.js';
export type TerminalTheme = ITheme;
export type TerminalEmulatorKind = 'xterm' | 'ghostty';

export interface TerminalTypography {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontVariations: Record<string, number>;
  cellHeight: number;
  tracking: number;
  baseline: number;
  thicken: boolean;
  thickenStrength: number;
  ligatures: boolean;
  fontFeatures?: Record<string, boolean>;
  palette?: TerminalPaletteSettings;
}

export function terminalFontVariationSettings(
  typography: Pick<TerminalTypography, 'fontVariations' | 'fontWeight'>,
): string {
  const variations = new Map(Object.entries(typography.fontVariations));
  variations.set('wght', typography.fontWeight);
  return [...variations]
    .filter(([tag, value]) =>
      /^[\x20-\x7e]{4}$/u.test(tag) && Number.isFinite(value))
    .sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)
    .map(([tag, value]) => `${JSON.stringify(tag)} ${String(value)}`)
    .join(', ');
}

export function terminalFontFeatureSettings(
  typography: Pick<TerminalTypography, 'fontFeatures' | 'ligatures'>,
): string {
  const features = {
    calt: typography.ligatures,
    liga: typography.ligatures,
    ...typography.fontFeatures,
  };
  return Object.entries(features)
    .filter(([tag]) => /^[\x20-\x7e]{4}$/u.test(tag))
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([tag, enabled]) => `${JSON.stringify(tag)} ${enabled ? '1' : '0'}`)
    .join(', ');
}

export function terminalThickenStrokeEm(strength: number): number {
  return 0.018 + (strength / 255) * 0.045;
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
  /** Sets the grid directly, bypassing container measurement. See `fit()`. */
  resize(cols: number, rows: number): void;
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
  setTypography(typography: TerminalTypography): void;
  setAppearance(theme?: TerminalTheme, adjustment?: GhosttyWindowAdjustment): void;
  dispose(): void;
}

function createXtermEmulator(theme?: TerminalTheme): TerminalEmulator {
  const terminal = new Terminal({
    cursorBlink: true,
    fontFamily: 'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace',
    fontSize: 13,
    minimumContrastRatio: 4.5,
    // Lets a shell-side diagnostic (`CSI 18 t`) confirm the emulator's own
    // rendered grid matches what the OS and the PTY report for it. The other
    // window-report queries stay off; they read or move the OS window itself.
    windowOptions: { getWinSizeChars: true },
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
    fit: () => {
      const proposed = fitAddon.proposeDimensions();
      if (!proposed) return;
      const { cols, rows } = clampTerminalGrid(proposed.cols, proposed.rows);
      if (cols !== terminal.cols || rows !== terminal.rows) terminal.resize(cols, rows);
    },
    resize: (cols, rows) => {
      const clamped = clampTerminalGrid(cols, rows);
      terminal.resize(clamped.cols, clamped.rows);
    },
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
    setTypography: () => undefined,
    setAppearance: (nextTheme) => {
      if (nextTheme) terminal.options.theme = nextTheme;
    },
    dispose: () => terminal.dispose(),
  };
}

function bounded(value: number | undefined, fallback: number, maximum: number): number {
  return Number.isFinite(value) ? Math.min(maximum, Math.max(0, value!)) : fallback;
}

function clampTerminalGrid(cols: number, rows: number): { cols: number; rows: number } {
  const clamp = (value: number, maximum: number) =>
    Math.max(1, Math.min(maximum, Math.floor(value)));
  return { cols: clamp(cols, 256), rows: clamp(rows, 128) };
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
  const tintAmount = bounded(adjustment.tintAmount, 0, 1);
  const tone = Number.isFinite(adjustment.tone)
    ? Math.min(1, Math.max(-1, adjustment.tone!))
    : 0;
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
  const layers: string[] = [];
  const blendModes: string[] = [];
  if (adjustment.tint && tintAmount > 0) {
    layers.push(`linear-gradient(rgb(from ${adjustment.tint} r g b / ${String(tintAmount)}), rgb(from ${adjustment.tint} r g b / ${String(tintAmount)}))`);
    blendModes.push(adjustment.blendMode ?? 'normal');
  }
  if (tone !== 0) {
    const toneColour = tone < 0 ? '0 0 0' : '255 255 255';
    layers.push(`linear-gradient(rgb(${toneColour} / ${String(Math.abs(tone))}), rgb(${toneColour} / ${String(Math.abs(tone))}))`);
    blendModes.push('normal');
  }
  host.style.backgroundImage = layers.join(', ');
  host.style.backgroundBlendMode = blendModes.join(', ');
  host.dataset.ghosttyPaddingBalance = String(adjustment.balance ?? false);
}

const ANSI_THEME_KEYS: Array<[keyof TerminalTheme, number]> = [
  ['black', 0], ['red', 1], ['green', 2], ['yellow', 3],
  ['blue', 4], ['magenta', 5], ['cyan', 6], ['white', 7],
  ['brightBlack', 8], ['brightRed', 9], ['brightGreen', 10],
  ['brightYellow', 11], ['brightBlue', 12], ['brightMagenta', 13],
  ['brightCyan', 14], ['brightWhite', 15],
];

function applyGhosttyAppearance(
  host: HTMLElement,
  theme: TerminalTheme | undefined,
  adjustment: GhosttyWindowAdjustment | undefined,
): void {
  if (theme?.foreground) host.style.setProperty('--term-fg', theme.foreground);
  if (theme?.background) host.style.setProperty('--term-bg', theme.background);
  if (theme?.cursor) host.style.setProperty('--term-cursor', theme.cursor);
  if (theme?.selectionBackground) {
    host.style.setProperty('--term-selection', theme.selectionBackground);
  }
  for (const [key, index] of ANSI_THEME_KEYS) {
    const colour = theme?.[key];
    if (typeof colour === 'string') {
      host.style.setProperty(`--term-color-${String(index)}`, colour);
    }
  }
  if (adjustment) applyGhosttyWindow(host, theme, adjustment);
}

function fitGhosttyTerminal(host: HTMLElement, terminal: WTerm): void {
  const style = getComputedStyle(host);
  const width = host.clientWidth
    - (parseFloat(style.paddingLeft) || 0)
    - (parseFloat(style.paddingRight) || 0);
  const height = host.clientHeight
    - (parseFloat(style.paddingTop) || 0)
    - (parseFloat(style.paddingBottom) || 0);
  if (width <= 0 || height <= 0) return;

  const row = document.createElement('div');
  row.className = 'term-row';
  row.style.visibility = 'hidden';
  row.style.position = 'absolute';
  const probe = document.createElement('span');
  probe.textContent = 'W';
  row.appendChild(probe);
  host.appendChild(row);
  const charWidth = probe.getBoundingClientRect().width;
  const rowHeight = row.getBoundingClientRect().height;
  row.remove();
  if (charWidth <= 0 || rowHeight <= 0) return;

  const { cols, rows } = clampTerminalGrid(width / charWidth, height / rowHeight);
  if (cols !== terminal.cols || rows !== terminal.rows) terminal.resize(cols, rows);
}

const SYSTEM_MONOSPACE =
  'ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace';

function applyTerminalTypography(
  host: HTMLElement,
  typography: TerminalTypography,
): void {
  const fontSizePixels = typography.fontSize * (96 / 72);
  const lineHeight = 1.2 * (1 + typography.cellHeight / 100);
  const fontFamily = typography.fontFamily === 'ui-monospace'
    ? SYSTEM_MONOSPACE
    : JSON.stringify(typography.fontFamily);

  host.style.setProperty('--term-font-family', fontFamily);
  host.style.setProperty('--term-font-size', `${String(fontSizePixels)}px`);
  host.style.setProperty(
    '--term-row-height',
    `${String(fontSizePixels * lineHeight)}px`,
  );
  host.style.setProperty('--term-line-height', String(lineHeight));
  host.style.fontWeight = String(typography.fontWeight);
  host.style.fontOpticalSizing = 'auto';
  host.style.fontVariationSettings = terminalFontVariationSettings(typography);
  host.style.letterSpacing = `${String(typography.tracking / 100)}em`;
  host.style.setProperty(
    '--maximal-term-baseline',
    `${String(-typography.baseline / 100)}em`,
  );
  const stroke = Number(terminalThickenStrokeEm(
    typography.thickenStrength,
  ).toFixed(4));
  host.style.webkitTextStroke = typography.thicken && typography.thickenStrength > 0
    ? `${String(stroke)}em currentColor`
    : '0 currentColor';
  host.style.fontVariantLigatures = typography.ligatures ? 'normal' : 'none';
  host.style.fontFeatureSettings = terminalFontFeatureSettings(typography);
}

async function createGhosttyEmulator(
  theme?: TerminalTheme,
  windowAdjustment?: GhosttyWindowAdjustment,
  typography?: TerminalTypography,
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
      const initialHeight = host.style.height;
      const style = document.createElement('style');
      style.dataset.maximalTerminalTypography = 'true';
      style.textContent = `
        .wterm .term-row > span,
        .wterm .term-row > .term-link,
        .wterm .term-link > span {
          transform: translateY(var(--maximal-term-baseline, 0));
        }
        .wterm ::selection {
          background: var(--term-selection, rgb(86 156 214 / 0.3));
        }
      `;
      host.appendChild(style);
      if (typography) applyTerminalTypography(host, typography);
      applyGhosttyAppearance(host, theme, windowAdjustment);
      host.addEventListener('keydown', handleKeyEvent, { capture: true });
      host.addEventListener('keyup', handleKeyUp, { capture: true });
      host.addEventListener('input', handleInput, { capture: true });
      terminal = new WTerm(host, {
        autoResize: false,
        core,
        cursorBlink: true,
        onData: (data) => {
          dataListeners.forEach((listener) => listener(data));
        },
        onResize: (cols, rows) => resizeListeners.forEach((listener) => listener({ cols, rows })),
        onTitle: emitTitle,
      });
      try {
        await terminal.init();
      }
      finally {
        host.style.height = initialHeight;
      }
    },
    fit: () => {
      if (element && terminal) fitGhosttyTerminal(element, terminal);
    },
    resize: (cols, rows) => {
      const clamped = clampTerminalGrid(cols, rows);
      terminal?.resize(clamped.cols, clamped.rows);
    },
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
    setTypography: (next) => {
      if (!element) return;
      applyTerminalTypography(element, next);
      if (terminal) fitGhosttyTerminal(element, terminal);
    },
    setAppearance: (nextTheme, nextAdjustment) => {
      if (!element) return;
      applyGhosttyAppearance(element, nextTheme, nextAdjustment);
    },
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
  typography?: TerminalTypography,
): Promise<TerminalEmulator> {
  return kind === 'ghostty'
    ? createGhosttyEmulator(theme, ghosttyWindow, typography)
    : createXtermEmulator(theme);
}
