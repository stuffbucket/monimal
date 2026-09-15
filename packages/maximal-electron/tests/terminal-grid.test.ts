import { describe, expect, it } from 'vitest';

import {
  clampTerminalGrid,
  MAX_TERMINAL_COLS,
  MAX_TERMINAL_ROWS,
} from '../src/shared/terminal-grid.js';

describe('clampTerminalGrid', () => {
  it('passes through a size already inside the bounds', () => {
    expect(clampTerminalGrid(80, 24)).toEqual({ cols: 80, rows: 24 });
  });

  it('clamps a size above the maximum', () => {
    expect(clampTerminalGrid(9999, 9999)).toEqual({
      cols: MAX_TERMINAL_COLS,
      rows: MAX_TERMINAL_ROWS,
    });
  });

  it('clamps a size at or below zero up to the minimum of 1', () => {
    expect(clampTerminalGrid(0, -5)).toEqual({ cols: 1, rows: 1 });
  });

  it('rounds a fractional size down', () => {
    expect(clampTerminalGrid(80.9, 24.9)).toEqual({ cols: 80, rows: 24 });
  });

  it('clamps each axis independently', () => {
    expect(clampTerminalGrid(9999, 1)).toEqual({ cols: MAX_TERMINAL_COLS, rows: 1 });
    expect(clampTerminalGrid(1, 9999)).toEqual({ cols: 1, rows: MAX_TERMINAL_ROWS });
  });
});
