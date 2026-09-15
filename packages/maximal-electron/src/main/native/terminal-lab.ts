import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

import type { Display, Rectangle } from 'electron';

import type { TrustedTerminalLaunch } from './terminal-launcher.js';

const WINDOW_STATE_FILE = '.terminal-lab-window.json';

interface TerminalLabWindowState {
  displayId: number;
  displayWorkArea: Rectangle;
  bounds: Rectangle;
}

function rectangle(value: unknown): value is Rectangle {
  if (value === null || value === undefined) return false;
  const record = value as Record<string, unknown>;
  return ['x', 'y', 'width', 'height'].every((key) =>
    Number.isFinite(record[key]) && Number(record[key]) >= (key === 'width' || key === 'height' ? 1 : -Infinity));
}

function windowState(value: unknown): value is TerminalLabWindowState {
  if (value === null) return false;
  const record = value as Record<string, unknown>;
  return Number.isFinite(record['displayId']) &&
    rectangle(record['displayWorkArea']) && rectangle(record['bounds']);
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function terminalLabWindowStatePath(appPath: string): string {
  return path.join(appPath, WINDOW_STATE_FILE);
}

export function restoreTerminalLabWindowBounds(
  appPath: string,
  displays: readonly Display[],
): Rectangle | undefined {
  if (displays.length === 0) return undefined;
  let state: unknown;
  try {
    // Stryker disable next-line StringLiteral: Node treats an empty encoding as utf8.
    state = JSON.parse(readFileSync(terminalLabWindowStatePath(appPath), 'utf8'));
  // Stryker disable next-line BlockStatement: leaving state undefined also fails windowState below.
  } catch {
    return undefined;
  }
  if (!windowState(state)) return undefined;

  const target = displays.find((display) => display.id === state.displayId) ?? displays[0]!;
  const area = target.workArea;
  const width = Math.min(state.bounds.width, area.width);
  const height = Math.min(state.bounds.height, area.height);
  const x = area.x + state.bounds.x - state.displayWorkArea.x;
  const y = area.y + state.bounds.y - state.displayWorkArea.y;
  return {
    x: clamp(x, area.x, area.x + area.width - width),
    y: clamp(y, area.y, area.y + area.height - height),
    width,
    height,
  };
}

export function saveTerminalLabWindowState(
  appPath: string,
  display: Pick<Display, 'id' | 'workArea'>,
  bounds: Rectangle,
): void {
  const state: TerminalLabWindowState = {
    displayId: display.id,
    displayWorkArea: display.workArea,
    bounds,
  };
  // Stryker disable next-line StringLiteral: Node treats an empty encoding as utf8.
  writeFileSync(terminalLabWindowStatePath(appPath), `${JSON.stringify(state)}\n`, 'utf8');
}

export function isTerminalLab(argv: readonly string[] = process.argv): boolean {
  return argv.includes('--terminal-lab');
}

export function terminalLabLaunch(
  appPath: string,
  executable = process.execPath,
): TrustedTerminalLaunch {
  const fixture = path.join(appPath, 'scripts', 'terminal-lab-fixture.mjs');
  if (!existsSync(fixture)) {
    throw new Error(`Terminal lab fixture is missing at ${fixture}.`);
  }
  return {
    command: executable,
    args: [fixture],
    cwd: appPath,
    env: { ELECTRON_RUN_AS_NODE: '1' },
  };
}