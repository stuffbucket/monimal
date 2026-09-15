import { describe, expect, it, vi } from 'vitest';

import { TerminalWindowGroups } from '../../src/main/native/pty-window-groups.js';

function terminalWindow(width: number, height: number, resizable = true) {
  let size = [width, height];
  return {
    isDestroyed: () => false,
    isResizable: () => resizable,
    getContentSize: () => size,
    setContentSize: vi.fn((nextWidth: number, nextHeight: number) => {
      size = [nextWidth, nextHeight];
    }),
  };
}

describe('TerminalWindowGroups', () => {
  it('allocates strict monotonic member indices across equal and backward clocks', () => {
    const times = [100, 100, 90];
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
      () => times.shift() ?? 0,
    );
    const original = terminalWindow(1000, 700);
    const firstCopy = terminalWindow(1000, 700);
    const secondCopy = terminalWindow(1000, 700);

    groups.observe('root', original, 80, 24);
    groups.observe('root', firstCopy, 80, 24);
    groups.observe('root', secondCopy, 80, 24);

    expect(groups.memberIndex('root', original)).toBe(100);
    expect(groups.memberIndex('root', firstCopy)).toBe(101);
    expect(groups.memberIndex('root', secondCopy)).toBe(102);
    expect(groups.oldestViewer('root', (viewer) => viewer !== original)).toBe(firstCopy);
  });

  it('keeps one canonical grid while synchronizing resizable physical windows', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    const source = terminalWindow(1100, 760);
    const copy = terminalWindow(760, 520);
    const apply = vi.fn();
    groups.observe('root', source, 120, 40);
    groups.observe('root', copy, 80, 24);

    groups.reconcile('root', 'user', apply, source);

    expect(apply).toHaveBeenCalledWith(
      { cols: 120, rows: 40 },
      expect.objectContaining({ cause: 'user', origin: source, revision: 1 }),
    );
    expect(copy.setContentSize).toHaveBeenCalledWith(1100, 760);
    expect(groups.canonical('root')?.grid).toEqual({ cols: 120, rows: 40 });
  });

  it('ignores applied echoes and stale echoes without changing canonical geometry', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    const source = terminalWindow(1000, 700);
    const copy = terminalWindow(700, 500);
    const apply = vi.fn();
    groups.observe('root', source, 100, 30);
    groups.observe('root', copy, 70, 20);
    groups.reconcile('root', 'user', apply, source);
    apply.mockClear();

    expect(groups.observe('root', copy, 75, 22)).toBe(true);
    expect(groups.canonical('root')?.grid).toEqual({ cols: 100, rows: 30 });
    expect(groups.viewers('root')?.get(copy)).toEqual({ cols: 100, rows: 30 });

    copy.setContentSize(850, 600);
    expect(groups.observe('root', copy, 85, 25)).toBe(false);
    groups.reconcile('root', 'user', apply, copy);
    expect(groups.canonical('root')).toMatchObject({
      grid: { cols: 85, rows: 25 },
      cause: 'user',
      revision: 2,
    });
  });

  it('resizes once per document and respects non-resizable viewer capability', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    const source = terminalWindow(1000, 700);
    const copy = terminalWindow(700, 500);
    const external = terminalWindow(600, 400, false);
    const apply = vi.fn();
    groups.setDocument('root', ['root', 'split']);
    for (const id of ['root', 'split']) {
      groups.observe(id, source, id === 'root' ? 60 : 40, 30);
      groups.observe(id, copy, id === 'root' ? 60 : 40, 30);
      groups.observe(id, external, id === 'root' ? 60 : 40, 30);
    }

    groups.reconcile('split', 'user', apply, source);
    expect(copy.setContentSize).not.toHaveBeenCalled();

    groups.reconcile('root', 'user', apply, source);
    expect(copy.setContentSize).toHaveBeenCalledOnce();
    expect(external.setContentSize).not.toHaveBeenCalled();
    expect(groups.observe('root', copy, 60, 30)).toBe(true);
    expect(groups.observe('split', copy, 40, 30)).toBe(true);
  });
});
