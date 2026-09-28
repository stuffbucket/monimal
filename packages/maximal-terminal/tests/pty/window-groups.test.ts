import { describe, expect, it, vi } from 'vitest';

import { TerminalWindowGroups } from '../../src/pty/window-groups.js';

function terminalWindow(width: number, height: number, resizable = true, destroyed = false) {
  let size = [width, height];
  return {
    isDestroyed: () => destroyed,
    isResizable: () => resizable,
    getContentSize: () => size,
    setContentSize: vi.fn((nextWidth: number, nextHeight: number) => {
      size = [nextWidth, nextHeight];
    }),
  };
}

function terminalWindowWithReadSequence(sizes: Array<[number, number]>) {
  let size = sizes[0] ?? [0, 0];
  return {
    isDestroyed: () => false,
    isResizable: () => true,
    getContentSize: () => {
      size = sizes.shift() ?? size;
      return size;
    },
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

  it('keeps a stable member index when the same viewer registers again', () => {
    const times = [5, 50];
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
      () => times.shift() ?? 0,
    );
    const viewer = terminalWindow(800, 600);

    expect(groups.registerViewer('root', viewer)).toBe(5);
    expect(groups.registerViewer('root', viewer)).toBe(5);
    expect(groups.memberIndex('root', viewer)).toBe(5);
  });

  it('reports viewer presence and absence explicitly', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    const viewer = terminalWindow(800, 600);

    expect(groups.hasViewer('missing', viewer)).toBe(false);
    expect(groups.viewers('missing')).toBeUndefined();
    expect(groups.canonical('missing')).toBeUndefined();
    expect(groups.memberIndex('missing', viewer)).toBeUndefined();
    expect(groups.oldestViewer('missing', () => true)).toBeUndefined();

    groups.observe('root', viewer, 80, 24);

    expect(groups.hasViewer('root', viewer)).toBe(true);
    expect(groups.hasViewer('root', terminalWindow(800, 600))).toBe(false);
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

  it('reconciles attach and detach causes to the smallest live viewer', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    const large = terminalWindow(1000, 700);
    const narrow = terminalWindow(700, 650);
    const short = terminalWindow(900, 500);
    const apply = vi.fn();
    groups.observe('root', large, 100, 40);
    groups.observe('root', narrow, 70, 35);
    groups.observe('root', short, 90, 25);

    const attach = groups.reconcile('root', 'attach', apply);

    expect(attach).toMatchObject({
      grid: { cols: 70, rows: 25 },
      cause: 'attach',
      revision: 1,
    });
    expect(apply).toHaveBeenCalledWith(
      { cols: 70, rows: 25 },
      expect.objectContaining({ cause: 'attach', revision: 1 }),
    );

    apply.mockClear();
    const unchanged = groups.reconcile('root', 'detach', apply);

    expect(unchanged).toBe(attach);
    expect(apply).not.toHaveBeenCalled();
  });

  it('applies row-only canonical changes', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    const viewer = terminalWindow(1000, 700);
    const apply = vi.fn();
    groups.observe('root', viewer, 100, 30);
    groups.reconcile('root', 'attach', apply, viewer);
    apply.mockClear();

    groups.observe('root', viewer, 100, 40);
    const geometry = groups.reconcile('root', 'user', apply, viewer);

    expect(geometry).toMatchObject({
      grid: { cols: 100, rows: 40 },
      revision: 2,
    });
    expect(apply).toHaveBeenCalledWith(
      { cols: 100, rows: 40 },
      expect.objectContaining({ revision: 2 }),
    );
  });

  it('does not physically synchronize non-user or requestorless reconciliations', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    const source = terminalWindow(1000, 700);
    const copy = terminalWindow(700, 500);
    groups.observe('root', source, 100, 30);
    groups.observe('root', copy, 70, 20);

    groups.reconcile('root', 'attach', vi.fn(), source);
    groups.reconcile('root', 'user', vi.fn());

    expect(copy.setContentSize).not.toHaveBeenCalled();
  });

  it('does not reconcile sessions without a live grid', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );

    expect(groups.reconcile('missing', 'attach', vi.fn())).toBeUndefined();
    groups.registerViewer('empty', terminalWindow(800, 600));
    expect(groups.reconcile('empty', 'attach', vi.fn())).toBeUndefined();
  });

  it('does not reconcile from a requestor that is not a live viewer', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    groups.observe('root', terminalWindow(800, 600), 80, 24);

    expect(groups.reconcile('root', 'user', vi.fn(), terminalWindow(900, 700))).toBeUndefined();
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

  it('rejects applied echoes when the physical window size no longer matches', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    const source = terminalWindow(1200, 800);
    const copy = terminalWindow(800, 600);
    groups.observe('root', source, 120, 40);
    groups.observe('root', copy, 80, 24);

    groups.reconcile('root', 'user', vi.fn(), source);
    copy.setContentSize(900, 700);

    expect(groups.observe('root', copy, 90, 30)).toBe(false);
    expect(groups.viewers('root')?.get(copy)).toEqual({ cols: 90, rows: 30 });

    copy.setContentSize(1200, 800);
    expect(groups.observe('root', copy, 95, 35)).toBe(false);
    expect(groups.viewers('root')?.get(copy)).toEqual({ cols: 95, rows: 35 });
  });

  it('clears a mismatched split-document echo for every pending leaf', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    const source = terminalWindow(1200, 800);
    const copy = terminalWindow(800, 600);
    groups.setDocument('root', ['root', 'split']);
    groups.observe('root', source, 120, 40);
    groups.observe('split', source, 60, 40);
    groups.observe('root', copy, 80, 24);
    groups.observe('split', copy, 40, 24);
    groups.reconcile('split', 'user', vi.fn(), source);
    groups.reconcile('root', 'user', vi.fn(), source);

    copy.setContentSize(900, 800);

    expect(groups.observe('root', copy, 90, 30)).toBe(false);
    copy.setContentSize(1200, 800);
    expect(groups.observe('split', copy, 45, 30)).toBe(false);
    expect(groups.viewers('split')?.get(copy)).toEqual({ cols: 45, rows: 30 });
  });

  it('rejects applied echoes when only one physical dimension no longer matches', () => {
    for (const size of [[1200, 700], [900, 800]] as const) {
      const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
        (window) => window.isResizable() ? 'native-window' : 'unavailable',
      );
      const source = terminalWindow(1200, 800);
      const copy = terminalWindow(800, 600);
      groups.observe('root', source, 120, 40);
      groups.observe('root', copy, 80, 24);
      groups.reconcile('root', 'user', vi.fn(), source);
      copy.setContentSize(size[0], size[1]);

      expect(groups.observe('root', copy, 90, 30)).toBe(false);
      expect(groups.viewers('root')?.get(copy)).toEqual({ cols: 90, rows: 30 });
    }
  });

  it('tracks applied physical resizes until every split leaf echoes them', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    const source = terminalWindow(1200, 800);
    const copy = terminalWindow(800, 600);
    groups.setDocument('root', ['root', 'split']);
    groups.observe('root', source, 120, 40);
    groups.observe('split', source, 60, 40);
    groups.observe('root', copy, 80, 24);
    groups.observe('split', copy, 40, 24);
    groups.reconcile('split', 'user', vi.fn(), source);
    groups.reconcile('root', 'user', vi.fn(), source);

    expect(groups.observe('root', copy, 90, 30)).toBe(true);
    expect(groups.viewers('root')?.get(copy)).toEqual({ cols: 120, rows: 40 });
    expect(groups.observe('split', copy, 45, 30)).toBe(true);
    expect(groups.viewers('split')?.get(copy)).toEqual({ cols: 60, rows: 40 });

    copy.setContentSize(900, 700);
    expect(groups.observe('root', copy, 90, 30)).toBe(false);
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
    expect(groups.observe('root', copy, 61, 31)).toBe(false);
    expect(groups.viewers('root')?.get(copy)).toEqual({ cols: 61, rows: 31 });
    expect(groups.observe('split', copy, 40, 30)).toBe(true);
    expect(groups.observe('split', copy, 41, 31)).toBe(false);
    expect(groups.viewers('split')?.get(copy)).toEqual({ cols: 41, rows: 31 });
  });

  it('does not apply an echo staged by another document group', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    const source = terminalWindow(1200, 800);
    const copy = terminalWindow(800, 600);
    groups.observe('root', source, 120, 40);
    groups.observe('root', copy, 80, 24);
    groups.reconcile('root', 'user', vi.fn(), source);

    groups.setDocument('new-root', ['root']);

    expect(groups.observe('root', copy, 90, 30)).toBe(false);
    expect(groups.viewers('root')?.get(copy)).toEqual({ cols: 90, rows: 30 });
  });

  it('tracks pending physical echoes only for sessions the target viewer has', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    const source = terminalWindow(1200, 800);
    const rootOnlyCopy = terminalWindow(800, 600);
    groups.setDocument('root', ['root', 'split']);
    groups.observe('root', source, 120, 40);
    groups.observe('split', source, 60, 40);
    groups.observe('root', rootOnlyCopy, 80, 24);
    groups.reconcile('split', 'user', vi.fn(), source);
    groups.reconcile('root', 'user', vi.fn(), source);

    expect(groups.observe('root', rootOnlyCopy, 90, 30)).toBe(true);
    expect(groups.observe('split', rootOnlyCopy, 45, 30)).toBe(false);
    expect(groups.viewers('split')?.get(rootOnlyCopy)).toEqual({ cols: 45, rows: 30 });
  });

  it('uses the observed grid for split leaves without canonical geometry after a physical echo', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    const source = terminalWindow(1200, 800);
    const copy = terminalWindow(800, 600);
    groups.setDocument('root', ['root', 'split']);
    groups.observe('root', source, 120, 40);
    groups.observe('split', source, 60, 40);
    groups.observe('root', copy, 80, 24);
    groups.observe('split', copy, 40, 24);

    groups.reconcile('root', 'user', vi.fn(), source);

    expect(groups.observe('root', copy, 90, 30)).toBe(true);
    expect(groups.observe('split', copy, 45, 30)).toBe(true);
    expect(groups.viewers('split')?.get(copy)).toEqual({ cols: 45, rows: 30 });
  });

  it('does not synchronize physical windows from invalid requestor sizes', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    const cases = [
      terminalWindow(1000, 700, true, true),
      terminalWindow(Number.NaN, 700),
      terminalWindow(0, 700),
      terminalWindow(1000, 0),
    ];

    cases.forEach((source, index) => {
      const sessionId = `root-${index}`;
      const copy = terminalWindow(700, 500);
      groups.observe(sessionId, source, 100, 30);
      groups.observe(sessionId, copy, 70, 20);
      groups.reconcile(sessionId, 'user', vi.fn(), source);
      expect(copy.setContentSize).not.toHaveBeenCalled();
    });
  });

  it('skips destroyed, unavailable, and already-matching viewers during physical sync', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    const source = terminalWindow(1000, 700);
    const destroyed = terminalWindow(700, 500, true, true);
    const unavailable = terminalWindow(700, 500, false);
    const matching = terminalWindow(1000, 700);
    groups.observe('root', source, 100, 30);
    groups.observe('root', destroyed, 70, 20);
    groups.observe('root', unavailable, 70, 20);
    groups.observe('root', matching, 70, 20);

    groups.reconcile('root', 'user', vi.fn(), source);

    expect(destroyed.setContentSize).not.toHaveBeenCalled();
    expect(unavailable.setContentSize).not.toHaveBeenCalled();
    expect(matching.setContentSize).not.toHaveBeenCalled();
  });

  it('resizes viewers that match only one physical dimension', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    const source = terminalWindow(1000, 700);
    const sameWidth = terminalWindow(1000, 500);
    const sameHeight = terminalWindow(800, 700);
    groups.observe('root', source, 100, 30);
    groups.observe('root', sameWidth, 80, 20);
    groups.observe('root', sameHeight, 80, 20);

    groups.reconcile('root', 'user', vi.fn(), source);

    expect(sameWidth.setContentSize).toHaveBeenCalledWith(1000, 700);
    expect(sameHeight.setContentSize).toHaveBeenCalledWith(1000, 700);
  });

  it('never stages the requestor as a physical resize target', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindowWithReadSequence>>(
      () => 'native-window',
    );
    const source = terminalWindowWithReadSequence([[1000, 700], [900, 700]]);
    const copy = terminalWindowWithReadSequence([[700, 500]]);
    groups.observe('root', source, 100, 30);
    groups.observe('root', copy, 70, 20);

    groups.reconcile('root', 'user', vi.fn(), source);

    expect(source.setContentSize).not.toHaveBeenCalled();
    expect(copy.setContentSize).toHaveBeenCalledWith(1000, 700);
  });

  it('promotes member indices when independent sessions join one document', () => {
    const times = [20, 10, 30];
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
      () => times.shift() ?? 0,
    );
    const rootViewer = terminalWindow(1000, 700);
    const splitViewer = terminalWindow(900, 600);
    const sharedViewer = terminalWindow(800, 500);
    groups.observe('root', rootViewer, 100, 30);
    groups.observe('split', splitViewer, 90, 30);
    groups.observe('root', sharedViewer, 80, 24);
    groups.observe('split', sharedViewer, 80, 24);

    groups.setDocument('root', ['split']);

    expect(groups.memberIndex('root', rootViewer)).toBe(20);
    expect(groups.memberIndex('root', splitViewer)).toBe(21);
    expect(groups.memberIndex('split', splitViewer)).toBe(21);
    expect(groups.memberIndex('split', sharedViewer)).toBe(30);
    expect(groups.oldestViewer('root', () => true)).toBe(rootViewer);
    expect(groups.oldestViewer('split', () => true)).toBe(splitViewer);
  });

  it('uses a promoted older sibling index when choosing the oldest viewer', () => {
    const times = [10, 20, 30];
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
      () => times.shift() ?? 0,
    );
    const promotedOldest = terminalWindow(800, 600);
    const originalRoot = terminalWindow(900, 600);
    groups.observe('split', promotedOldest, 80, 24);
    groups.observe('root', originalRoot, 90, 24);
    groups.observe('root', promotedOldest, 80, 24);

    groups.setDocument('root', ['split']);

    expect(groups.memberIndex('root', promotedOldest)).toBe(10);
    expect(groups.oldestViewer('root', () => true)).toBe(promotedOldest);
  });

  it('does not replace an older root member index with a newer split index', () => {
    const times = [10, 20];
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
      () => times.shift() ?? 0,
    );
    const sharedViewer = terminalWindow(800, 600);
    groups.observe('root', sharedViewer, 80, 24);
    groups.observe('split', sharedViewer, 80, 24);

    groups.setDocument('root', ['split']);

    expect(groups.memberIndex('root', sharedViewer)).toBe(10);
    expect(groups.memberIndex('split', sharedViewer)).toBe(10);
  });

  it('removes viewers, windows, and sessions from membership and pending echoes', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    const source = terminalWindow(1000, 700);
    const copy = terminalWindow(700, 500);
    groups.setDocument('root', ['root', 'split']);
    groups.observe('root', source, 100, 30);
    groups.observe('split', source, 50, 30);
    groups.observe('root', copy, 70, 20);
    groups.observe('split', copy, 40, 20);
    groups.reconcile('root', 'user', vi.fn(), source);

    expect(groups.removeViewer('missing', copy)).toBe(false);
    expect(groups.removeViewer('ghost', terminalWindow(800, 600))).toBe(false);
    expect(groups.removeViewer('root', copy)).toBe(true);
    expect(groups.hasViewer('root', copy)).toBe(false);
    expect(groups.hasViewer('split', copy)).toBe(true);
    expect(groups.memberIndex('split', copy)).toBeDefined();
    expect(groups.observe('split', copy, 45, 25)).toBe(true);

    groups.removeWindow(copy);

    expect(groups.hasViewer('split', copy)).toBe(false);
    expect(groups.memberIndex('split', copy)).toBeUndefined();

    groups.removeSession('missing');
    groups.removeSession('split');

    expect(groups.viewers('split')).toBeUndefined();
    expect(groups.memberIndex('root', source)).toBeDefined();
  });

  it('removes a single-session viewer from membership indexes', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    const viewer = terminalWindow(800, 600);
    groups.observe('root', viewer, 80, 24);

    expect(groups.removeViewer('root', viewer)).toBe(true);

    expect(groups.hasViewer('root', viewer)).toBe(false);
    expect(groups.memberIndex('root', viewer)).toBeUndefined();
  });

  it('drops pending echoes when an entire window is removed', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    const source = terminalWindow(1200, 800);
    const copy = terminalWindow(800, 600);
    groups.observe('root', source, 120, 40);
    groups.observe('root', copy, 80, 24);
    groups.reconcile('root', 'user', vi.fn(), source);

    groups.removeWindow(copy);

    expect(groups.observe('root', copy, 90, 30)).toBe(false);
    expect(groups.viewers('root')?.get(copy)).toEqual({ cols: 90, rows: 30 });
  });

  it('removes a closed session from pending physical echoes', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    const source = terminalWindow(1200, 800);
    const copy = terminalWindow(800, 600);
    groups.setDocument('root', ['root', 'split']);
    groups.observe('root', source, 120, 40);
    groups.observe('split', source, 60, 40);
    groups.observe('root', copy, 80, 24);
    groups.observe('split', copy, 40, 24);
    groups.reconcile('split', 'user', vi.fn(), source);
    groups.reconcile('root', 'user', vi.fn(), source);

    groups.removeSession('split');
    expect(groups.observe('root', copy, 90, 30)).toBe(true);
    groups.setDocument('root', ['split']);

    expect(groups.observe('split', copy, 45, 30)).toBe(false);
    expect(groups.viewers('split')?.get(copy)).toEqual({ cols: 45, rows: 30 });
  });

  it('ignores removed split leaves during later physical synchronization', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    const source = terminalWindow(1200, 800);
    const copy = terminalWindow(800, 600);
    groups.setDocument('root', ['split']);
    groups.observe('root', source, 120, 40);
    groups.observe('split', source, 60, 40);
    groups.observe('root', copy, 80, 24);
    groups.observe('split', copy, 40, 24);

    groups.removeSession('split');
    source.setContentSize(1300, 820);
    groups.reconcile('root', 'user', vi.fn(), source);

    expect(copy.setContentSize).toHaveBeenCalledWith(1300, 820);
    expect(groups.observe('root', copy, 120, 40)).toBe(true);
    expect(groups.viewers('split')).toBeUndefined();
  });

  it('prunes empty groups after the last session is removed', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    const viewer = terminalWindow(800, 600);
    groups.observe('root', viewer, 80, 24);

    groups.removeSession('root');

    expect(groups.viewers('root')).toBeUndefined();
    expect(groups.memberIndex('root', viewer)).toBeUndefined();

    const nextViewer = terminalWindow(900, 700);
    groups.observe('root', nextViewer, 90, 30);
    expect(groups.memberIndex('root', viewer)).toBeUndefined();
    expect(groups.memberIndex('root', nextViewer)).toBeDefined();
  });

  it('prunes previous independent groups after joining a document', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    const oldSplitViewer = terminalWindow(800, 600);
    groups.observe('split', oldSplitViewer, 80, 24);
    groups.setDocument('root', ['split']);
    groups.removeSession('split');

    const nextSplitViewer = terminalWindow(900, 700);
    groups.observe('split', nextSplitViewer, 90, 30);

    expect(groups.memberIndex('split', oldSplitViewer)).toBeUndefined();
    expect(groups.memberIndex('split', nextSplitViewer)).toBeDefined();
  });

  it('returns no oldest viewer when no live viewer matches the predicate', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    groups.observe('root', terminalWindow(800, 600), 80, 24);

    expect(groups.oldestViewer('root', () => false)).toBeUndefined();
  });

  it('does not reconcile non-finite grids selected from live viewers', () => {
    const groups = new TerminalWindowGroups<ReturnType<typeof terminalWindow>>(
      (window) => window.isResizable() ? 'native-window' : 'unavailable',
    );
    groups.observe('root', terminalWindow(800, 600), Number.NaN, 24);

    expect(groups.reconcile('root', 'attach', vi.fn())).toBeUndefined();
    expect(groups.canonical('root')).toBeUndefined();
  });
});
