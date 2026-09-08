import { describe, expect, it } from 'vitest';

import { isGeneric, reExportedNames } from '../scripts/export-checks.mjs';

/**
 * What `verify:exports` reads off the built renderer entry to decide whether
 * the published surface is the approved one.
 *
 * It had no test. It is also the one regular expression in this package that
 * CodeQL reported as `js/polynomial-redos` (high): `[^}]+` could run across
 * any number of following `export {` sequences before failing on the closing
 * brace, so every start position paid for the rest of the file.
 */

describe('reExportedNames', () => {
  it('reads names out of a re-export, sorted', () => {
    expect(reExportedNames("export { b, a } from './x.js';")).toEqual(['a', 'b']);
  });

  it('reads the trailing comma tsc emits', () => {
    expect(reExportedNames("export { NavRail, } from './components/NavRail.js';")).toEqual([
      'NavRail',
    ]);
  });

  it('reads several statements', () => {
    const source = [
      "export { Canvas } from './components/Canvas.js';",
      "export { TabBar, getTabPanelId } from './components/TabBar.js';",
    ].join('\n');
    expect(reExportedNames(source)).toEqual(['Canvas', 'TabBar', 'getTabPanelId']);
  });

  /*
   * A local `export {}` is not a re-export: it names nothing a consumer
   * imports from this package by path.
   */
  it('ignores an export clause with no source', () => {
    expect(reExportedNames('export { local };')).toEqual([]);
  });

  /*
   * The accuracy half of the ReDoS fix. An ECMAScript export clause cannot
   * contain `{`, so a match that crossed one was never a single statement --
   * the old pattern would have read this as one clause holding both bodies.
   */
  it('does not run a clause across an opening brace', () => {
    expect(reExportedNames("export { a } ;\nconst x = { y: 1 };\nexport { b } from './b.js';")).toEqual(
      ['b'],
    );
  });

  /*
   * The performance half, as a bound rather than a ratio, because a ratio
   * needs a second implementation to compare against.
   *
   * Measured on the machine this was written on: the previous pattern took
   * 172 ms here and quadrupled on each doubling of the input -- 682 ms at
   * 16,000. This one takes 0.15 ms and doubles. The bound is 50 ms, which
   * leaves the current implementation more than two orders of magnitude of
   * headroom and still fails the one it replaced by more than three times.
   */
  it('scans an adversarial input in linear time', () => {
    const hostile = `export{${'|export{'.repeat(8000)}`;
    const started = performance.now();
    expect(reExportedNames(hostile)).toEqual([]);
    expect(performance.now() - started).toBeLessThan(50);
  });
});

describe('isGeneric', () => {
  it('allows the pure terminal scheduler without allowing application libraries', () => {
    expect(isGeneric('dist/renderer/lib/terminal-ack.js')).toBe(true);
    expect(isGeneric('dist/renderer/lib/bridge-terminal.js')).toBe(false);
  });
});
