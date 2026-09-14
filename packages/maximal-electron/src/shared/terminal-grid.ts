/** Bounds pathological layout measurements before they reach an emulator or PTY. */
export const MAX_TERMINAL_COLS = 256;
export const MAX_TERMINAL_ROWS = 128;

/** Clamps a proposed grid to `[1, MAX_TERMINAL_COLS/ROWS]`, rounding down. */
export function clampTerminalGrid(cols: number, rows: number): { cols: number; rows: number } {
  return {
    cols: Math.min(MAX_TERMINAL_COLS, Math.max(1, Math.floor(cols))),
    rows: Math.min(MAX_TERMINAL_ROWS, Math.max(1, Math.floor(rows))),
  };
}
