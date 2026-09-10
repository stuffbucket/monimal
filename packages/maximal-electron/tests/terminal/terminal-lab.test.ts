import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  isTerminalLab,
  restoreTerminalLabWindowBounds,
  saveTerminalLabWindowState,
  terminalLabLaunch,
  terminalLabWindowStatePath,
} from '../../src/main/native/terminal-lab.js';

function display(id: number, x: number, y: number, width: number, height: number) {
  return { id, workArea: { x, y, width, height } } as Electron.Display;
}

describe('terminal lab launch boundary', () => {
  it('requires the exact launch argument', () => {
    expect(isTerminalLab(['electron', '.', '--terminal-lab'])).toBe(true);
    expect(isTerminalLab(['electron', '.', '--terminal-lab=1'])).toBe(false);
    expect(isTerminalLab(['electron', '.', 'terminal-lab'])).toBe(false);
  });

  it('launches only the host-owned fixture with Electron running as Node', () => {
    const appPath = mkdtempSync(path.join(tmpdir(), 'terminal-lab-'));
    const scripts = path.join(appPath, 'scripts');
    mkdirSync(scripts);
    writeFileSync(path.join(scripts, 'terminal-lab-fixture.mjs'), '');

    expect(terminalLabLaunch(appPath, '/Applications/Electron')).toEqual({
      command: '/Applications/Electron',
      args: [path.join(scripts, 'terminal-lab-fixture.mjs')],
      cwd: appPath,
      env: { ELECTRON_RUN_AS_NODE: '1' },
    });
  });

  it('fails before launch when the fixed fixture is absent', () => {
    const appPath = mkdtempSync(path.join(tmpdir(), 'terminal-lab-missing-'));
    expect(() => terminalLabLaunch(appPath, '/Applications/Electron')).toThrow(
      `Terminal lab fixture is missing at ${path.join(appPath, 'scripts', 'terminal-lab-fixture.mjs')}.`,
    );
  });

  it('restores the saved size and monitor-relative position', () => {
    const appPath = mkdtempSync(path.join(tmpdir(), 'terminal-lab-window-'));
    saveTerminalLabWindowState(
      appPath,
      display(7, 1440, 0, 1920, 1080),
      { x: 1540, y: 80, width: 1200, height: 800 },
    );

    expect(JSON.parse(readFileSync(terminalLabWindowStatePath(appPath), 'utf8'))).toEqual({
      displayId: 7,
      displayWorkArea: { x: 1440, y: 0, width: 1920, height: 1080 },
      bounds: { x: 1540, y: 80, width: 1200, height: 800 },
    });
    expect(restoreTerminalLabWindowBounds(appPath, [
      display(1, 0, 0, 1440, 900),
      display(7, -1920, 0, 1920, 1080),
    ])).toEqual({ x: -1820, y: 80, width: 1200, height: 800 });
  });

  it('clamps stale state onto an available display', () => {
    const appPath = mkdtempSync(path.join(tmpdir(), 'terminal-lab-window-'));
    writeFileSync(terminalLabWindowStatePath(appPath), JSON.stringify({
      displayId: 99,
      displayWorkArea: { x: 2000, y: 0, width: 1600, height: 1000 },
      bounds: { x: 3500, y: 900, width: 1400, height: 900 },
    }));

    expect(restoreTerminalLabWindowBounds(appPath, [display(1, 0, 0, 1280, 720)]))
      .toEqual({ x: 0, y: 0, width: 1280, height: 720 });
  });
});