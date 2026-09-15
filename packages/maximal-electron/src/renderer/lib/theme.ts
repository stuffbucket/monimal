import type { TerminalTheme } from './terminal-emulator.js';

/**
 * The emulator's colours, as design tokens.
 *
 * The emulator renders its own cells, so it cannot inherit text colours from
 * CSS. It takes a theme object of literal colour strings instead, which is why the
 * terminal is the one surface that has to resolve tokens by hand.
 *
 * These three are the ones it needs. The rest of its palette — the sixteen
 * ANSI colours — stays at the emulator default, because a shell's own colours
 * are not this application's to restyle.
 */
export const TERMINAL_TOKENS = {
  background: '--bg-canvas',
  foreground: '--text-primary',
  cursor: '--accent',
} as const;

/**
 * Resolve the emulator's theme from design tokens.
 *
 * `read` returns a token's current value. In the application that is
 * `getComputedStyle(document.documentElement).getPropertyValue`; taking it as
 * a parameter keeps this pure, so the mapping is testable without a DOM.
 *
 * A token that does not resolve is left out rather than passed through empty.
 * Omitting an empty value keeps the emulator's legible default.
 */
export function terminalTheme(read: (token: string) => string): TerminalTheme {
  const theme: TerminalTheme = {};

  const background = read(TERMINAL_TOKENS.background).trim();
  if (background) theme.background = background;

  const foreground = read(TERMINAL_TOKENS.foreground).trim();
  if (foreground) theme.foreground = foreground;

  const cursor = read(TERMINAL_TOKENS.cursor).trim();
  if (cursor) theme.cursor = cursor;

  return theme;
}

/** The emulator theme for the document's current scheme. */
export function currentTerminalTheme(): TerminalTheme {
  const styles = getComputedStyle(document.documentElement);
  return terminalTheme((token) => styles.getPropertyValue(token));
}
