import { readFileSync } from 'node:fs';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  TERMINAL_TOKENS,
  currentTerminalTheme,
  terminalTheme,
} from '../src/renderer/lib/theme.js';

/**
 * The terminal's theme.
 *
 * `ghostty-web` draws to a canvas, so it is the one surface in the shell that
 * cannot inherit its colours from CSS. It used to carry three hard-coded hex
 * values, which were the dark palette. The terminal therefore stayed dark in
 * the light theme, and `docs/architecture.md`'s claim that no component holds
 * a hex value was false.
 *
 * These tests pin the mapping and, more importantly, pin it to tokens that
 * actually exist. A token rename in `tokens.css` would otherwise resolve to an
 * empty string at runtime and show up only as a terminal that stopped
 * following the theme.
 */

const TOKENS_CSS = readFileSync(
  new URL('../src/renderer/styles/tokens.css', import.meta.url),
  'utf8',
);

/** Every token, in the order `terminalTheme` reads them. */
const ORDER = ['--bg-canvas', '--text-primary', '--accent'];

describe('terminalTheme', () => {
  it('maps each emulator colour to its documented token', () => {
    const theme = terminalTheme((token) => `value(${token})`);
    expect(theme).toEqual({
      background: 'value(--bg-canvas)',
      foreground: 'value(--text-primary)',
      cursor: 'value(--accent)',
    });
  });

  it('reads exactly the documented tokens, and nothing else', () => {
    const seen: string[] = [];
    terminalTheme((token) => {
      seen.push(token);
      return '#000000';
    });
    expect(seen).toEqual(ORDER);
    expect(Object.values(TERMINAL_TOKENS)).toEqual(ORDER);
  });

  it('trims what it reads', () => {
    // `getPropertyValue` returns a custom property with its leading space
    // intact. Handed through untrimmed, the emulator fails to parse it and
    // renders black.
    const theme = terminalTheme(() => '  #123456  ');
    expect(theme.background).toBe('#123456');
  });

  it('omits a token that does not resolve, rather than passing it through', () => {
    // An unrecognised colour parses to black in `ghostty-web`, so an empty
    // string would render black on black. Leaving the key out keeps the
    // emulator's own default, which is legible.
    const theme = terminalTheme(() => '');
    expect(theme).toEqual({});
    expect('background' in theme).toBe(false);
  });

  it('treats whitespace as unresolved', () => {
    expect(terminalTheme(() => '   ')).toEqual({});
  });

  it('omits only the token that is missing', () => {
    const theme = terminalTheme((token) =>
      token === TERMINAL_TOKENS.cursor ? '' : '#abcdef',
    );
    expect(theme).toEqual({ background: '#abcdef', foreground: '#abcdef' });
  });
});

describe('TERMINAL_TOKENS', () => {
  it('names tokens that tokens.css actually defines, in both schemes', () => {
    // The tripwire. A rename in tokens.css leaves this mapping pointing at
    // nothing, and the only symptom at runtime is a terminal that quietly
    // stops following the theme.
    for (const token of Object.values(TERMINAL_TOKENS)) {
      const definitions = TOKENS_CSS.match(new RegExp(`${token}\\s*:`, 'g')) ?? [];
      expect(definitions, `${token} should be defined for dark and light`).toHaveLength(
        2,
      );
    }
  });

  it('uses semantic names, not raw palette entries', () => {
    for (const token of Object.values(TERMINAL_TOKENS)) {
      expect(token.startsWith('--')).toBe(true);
      expect(/^#|rgb/.test(token)).toBe(false);
    }
  });

  it('names tokens whose values ghostty-web can actually parse', () => {
    // The gap in the tripwire above. Proving a token exists says nothing about
    // the syntax of its value, and `parseColorToHex` in `ghostty-web` accepts
    // only `#rgb`, `#rrggbb`, and comma-separated `rgb(r, g, b)`. Anything
    // else returns 0, so the terminal renders black on black rather than
    // failing.
    //
    // This is not hypothetical. `tokens.css` already uses the modern
    // space-separated form for `--accent-soft`, so a rewrite of these three in
    // that style, or in `oklch()`, would break the terminal silently.
    const PARSEABLE = /^(#[0-9a-f]{3}|#[0-9a-f]{6}|rgb\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*\))$/i;

    for (const token of Object.values(TERMINAL_TOKENS)) {
      const values = [...TOKENS_CSS.matchAll(new RegExp(`${token}\\s*:\\s*([^;]+);`, 'g'))]
        .map((match) => (match[1] ?? '').trim());

      expect(values, `${token} should be defined twice`).toHaveLength(2);
      for (const value of values) {
        expect(PARSEABLE.test(value), `${token}: ${value}`).toBe(true);
      }
    }
  });
});

describe('currentTerminalTheme', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('resolves the tokens against the document root', () => {
    // The DOM boundary, stubbed rather than emulated. Mutation testing found
    // this function uncovered, and the mutants it produced are the two ways
    // the adapter can be wrong: reading from the wrong element, and losing
    // the lookup. Both are invisible to a test of `terminalTheme` alone.
    const root = Symbol('documentElement');
    const seen: string[] = [];
    const values: Record<string, string> = {
      '--bg-canvas': ' #101216 ',
      '--text-primary': '#e6e8ec',
      '--accent': '#6ea8fe',
    };

    let queried: unknown;
    vi.stubGlobal('document', { documentElement: root });
    vi.stubGlobal('getComputedStyle', (element: unknown) => {
      queried = element;
      return {
        getPropertyValue: (token: string) => {
          seen.push(token);
          return values[token] ?? '';
        },
      };
    });

    expect(currentTerminalTheme()).toEqual({
      background: '#101216',
      foreground: '#e6e8ec',
      cursor: '#6ea8fe',
    });

    expect(queried).toBe(root);
    expect(seen).toEqual(Object.values(TERMINAL_TOKENS));
  });

  it('returns an empty theme when the tokens do not resolve', () => {
    vi.stubGlobal('document', { documentElement: {} });
    vi.stubGlobal('getComputedStyle', () => ({ getPropertyValue: () => '' }));

    expect(currentTerminalTheme()).toEqual({});
  });
});
