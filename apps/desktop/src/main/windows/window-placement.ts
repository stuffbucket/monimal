import { screen } from 'electron'

/** Place both startup windows on the same primary work area instead of using Electron's independent defaults. */
export function centerOnPrimaryDisplay(width: number, height: number): { x: number; y: number } {
  const { x, y, width: displayWidth, height: displayHeight } = screen.getPrimaryDisplay().workArea
  return {
    x: x + Math.max(0, Math.floor((displayWidth - width) / 2)),
    y: y + Math.max(0, Math.floor((displayHeight - height) / 2)),
  }
}
