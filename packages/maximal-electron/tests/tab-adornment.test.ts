import { describe, expect, it } from 'vitest';

import {
  adornmentLabel,
  EMPHASIS_LABELS,
  STATUS_LABELS,
  TAB_EMPHASIS,
  TAB_ICON_NAMES,
  tabSlot,
  type TabAdornment,
} from '../src/renderer/lib/tab-adornment.js';

import { stylesheets } from './stylesheets.js';

/**
 * The rules for a tab's adornments.
 *
 * Two claims. The slot resolves to one thing, and every non-textual signal
 * contributes words, because a dot, a rule down an edge and a travelling bar
 * are each colour or motion alone and WCAG 1.4.1 refuses all three.
 */

describe('tabSlot', () => {
  const loaded: TabAdornment = { status: 'running', icon: 'terminal' };

  it('gives the slot to the caller-supplied component', () => {
    expect(tabSlot(loaded, true)).toBe('custom');
  });

  it('gives it to the status when the caller supplied nothing', () => {
    // The perishable signal beats the identity one. A tab that is running says
    // so; what it is stays true whether or not the slot says it.
    expect(tabSlot(loaded, false)).toBe('status');
  });

  it('falls back to the sourced icon', () => {
    expect(tabSlot({ icon: 'terminal' }, false)).toBe('icon');
  });

  it('draws nothing when a tab carries no signal', () => {
    expect(tabSlot({}, false)).toBe('none');
  });

  it('does not count emphasis, which is drawn on the tab rather than in it', () => {
    expect(tabSlot({ emphasis: 'busy' }, false)).toBe('none');
  });
});

describe('adornmentLabel', () => {
  it('is undefined when a tab carries nothing to announce', () => {
    expect(adornmentLabel({})).toBeUndefined();
  });

  it('names each status the stylesheet colours', () => {
    expect(adornmentLabel({ status: 'running' })).toBe('Running');
    expect(adornmentLabel({ status: 'blocked' })).toBe('Blocked');
    expect(adornmentLabel({ status: 'done' })).toBe('Done');
    expect(adornmentLabel({ status: 'failed' })).toBe('Failed');
  });

  it('says nothing about a status the stylesheet does not colour', () => {
    // That dot is the default grey, so colour carries no information and there
    // is nothing for words to replace.
    expect(adornmentLabel({ status: 'unknown-to-the-stylesheet' })).toBeUndefined();
  });

  it('prefers the wording the caller supplied', () => {
    expect(adornmentLabel({ status: 'running', statusLabel: 'Deploying' })).toBe('Deploying');
  });

  it('takes that wording for a status it would not have named', () => {
    expect(adornmentLabel({ status: 'queued', statusLabel: 'Queued' })).toBe('Queued');
  });

  it('names each emphasis', () => {
    expect(adornmentLabel({ emphasis: 'attention' })).toBe('Needs attention');
    expect(adornmentLabel({ emphasis: 'busy' })).toBe('Working');
  });

  it('reads both when a tab carries both', () => {
    // The slot holds one thing; the tab carries two signals. Announcing only
    // the one that won the slot would drop the other.
    expect(adornmentLabel({ status: 'running', emphasis: 'attention' })).toBe(
      'Running, Needs attention',
    );
  });

  it('reads the status first, in the order the tab draws them', () => {
    expect(adornmentLabel({ status: 'failed', emphasis: 'busy' })).toBe('Failed, Working');
  });
});

describe('the vocabularies', () => {
  it('are the smallest set that covers a real state', () => {
    // Pinned rather than derived. Growing either list is a design decision and
    // should not pass as an incidental diff.
    expect([...TAB_EMPHASIS]).toEqual(['attention', 'busy']);
    expect([...TAB_ICON_NAMES]).toEqual(['document', 'folder', 'settings', 'terminal']);
  });

  it('name every emphasis and every coloured status', () => {
    for (const emphasis of TAB_EMPHASIS) {
      expect(EMPHASIS_LABELS.get(emphasis), emphasis).not.toBe(undefined);
      expect(EMPHASIS_LABELS.get(emphasis), emphasis).not.toBe('');
    }
    expect([...STATUS_LABELS.keys()].sort()).toEqual(['blocked', 'done', 'failed', 'running']);
    for (const [status, words] of STATUS_LABELS) {
      expect(words, status).not.toBe('');
    }
  });
});

describe('the stylesheets draw every emphasis', () => {
  /*
   * The scope proof.
   *
   * An emphasis with no rule renders as nothing at all — a signal the caller
   * asked for and the user never sees. Both stylesheets are checked, because
   * `shell.css` is this application's and `structural.css` is the one a
   * consumer imports, and a treatment landing in only the first is the defect
   * `tests/package-styles.test.ts` was written for.
   */
  const files = stylesheets();

  it('reads the stylesheets it claims to read', () => {
    // The floor. A scan that found no files would report every emphasis as
    // styled, which is the empty-scope false pass this repository keeps hitting.
    const names = files.map(([name]) => name);
    expect(names).toContain('shell.css');
    expect(names).toContain('structural.css');
    expect(TAB_EMPHASIS.length).toBeGreaterThan(0);
  });

  it('has a rule for each, in both', () => {
    for (const name of ['shell.css', 'structural.css']) {
      const [, css] = files.find(([file]) => file === name) ?? ['', ''];
      for (const emphasis of TAB_EMPHASIS) {
        expect(css, `${name} draws ${emphasis}`).toContain(`[data-emphasis='${emphasis}']`);
      }
    }
  });

  it('parks the travelling marker where reduced motion leaves it', () => {
    // `prefers-reduced-motion` collapses the duration rather than removing the
    // animation, so the frame a user sees is whichever one 100% names. A cycle
    // whose last frame is not its first parks the bar mid-travel for good.
    const parked = files.filter(([, css]) =>
      /@keyframes\s+[\w-]*busy\s*\{\s*0%,\s*100%\s*\{/i.test(css),
    );
    expect(parked.map(([name]) => name).sort()).toEqual(['shell.css', 'structural.css']);
  });
});
