import { SquareTerminal } from 'lucide-react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { TabBar, type Tab } from '../src/renderer/components/TabBar.js';

/**
 * What the tab strip puts in the slot, and what it says while putting it there.
 *
 * Markup rather than a browser: the question is what the component decides, not
 * where the pixels land. `TabBar.stories.tsx` shows the pixels and
 * `npm run storybook:check` runs axe over them.
 */

function strip(tabs: Tab[], icon?: (tab: Tab) => typeof SquareTerminal | undefined) {
  return renderToStaticMarkup(
    <TabBar
      tabIdBase="test"
      tabs={tabs}
      active={tabs[0]?.id ?? ''}
      onSelect={() => undefined}
      icon={icon}
    />,
  );
}

/** How many `<svg>` a tab strip drew, which is how many glyphs it chose. */
function glyphs(markup: string): number {
  return [...markup.matchAll(/<svg/g)].length;
}

describe('the adornment slot', () => {
  it('draws the icon a tab names', () => {
    const markup = strip([{ id: 'a', title: 'Terminal 1', icon: 'terminal' }]);
    expect(markup).toContain('lucide-square-terminal');
  });

  it('draws a caller-supplied component instead of the named one', () => {
    const markup = strip(
      [{ id: 'a', title: 'Report', icon: 'document' }],
      () => SquareTerminal,
    );
    expect(markup).toContain('lucide-square-terminal');
    expect(markup).not.toContain('lucide-file-text');
  });

  it('gives the slot to the status, and draws one glyph, not two', () => {
    const markup = strip([{ id: 'a', title: 'Deploy', icon: 'terminal', status: 'running' }]);
    expect(markup).toContain("data-status=\"running\"");
    // The complaint that opened this: a strip whose tabs disagree about how
    // many things sit before the label does not read as a row.
    expect(glyphs(markup)).toBe(0);
  });

  it('leaves the slot empty when a tab carries no signal', () => {
    const markup = strip([{ id: 'a', title: 'Library' }]);
    expect(glyphs(markup)).toBe(0);
    expect(markup).not.toContain('class="dot"');
  });

  it('draws exactly one glyph per adorned tab', () => {
    // The floor for the counts above: a render that produced nothing would
    // satisfy every `not.toContain` in this file.
    const markup = strip([
      { id: 'a', title: 'One', icon: 'terminal' },
      { id: 'b', title: 'Two', icon: 'folder' },
      { id: 'c', title: 'Three', icon: 'settings' },
    ]);
    expect(glyphs(markup)).toBe(3);
  });
});

describe('emphasis', () => {
  it('marks the tab, so the stylesheet can draw a shape the slot has no room for', () => {
    const markup = strip([{ id: 'a', title: 'Approve', emphasis: 'attention' }]);
    expect(markup).toContain('data-emphasis="attention"');
    expect(markup).toContain('class="tab__emphasis"');
  });

  it('marks nothing when a tab has none', () => {
    expect(strip([{ id: 'a', title: 'Library' }])).not.toContain('data-emphasis');
  });

  it('leaves the slot to the status, because the two are different places', () => {
    const markup = strip([{ id: 'a', title: 'Deploy', status: 'running', emphasis: 'busy' }]);
    expect(markup).toContain('data-emphasis="busy"');
    expect(markup).toContain("data-status=\"running\"");
  });
});

describe('the accessible name', () => {
  it('carries the words for a signal that is only a colour', () => {
    // WCAG 1.4.1. The dot is the whole message and a screen reader gets none
    // of it, so the tab reads "Deploy, Running" rather than "Deploy".
    const markup = strip([{ id: 'a', title: 'Deploy', status: 'running' }]);
    expect(markup).toContain('Running');
  });

  it('carries the words for a signal that is only a shape', () => {
    expect(strip([{ id: 'a', title: 'Approve', emphasis: 'attention' }])).toContain(
      'Needs attention',
    );
  });

  it('adds nothing to a tab that signals nothing', () => {
    const markup = strip([{ id: 'a', title: 'Library' }]);
    expect(markup).not.toContain('Running');
    expect(markup).toContain('Library');
  });

  it('hides the shapes themselves from the reader that gets the words', () => {
    const markup = strip([{ id: 'a', title: 'Deploy', status: 'running', emphasis: 'busy' }]);
    expect([...markup.matchAll(/aria-hidden="true"/g)].length).toBeGreaterThanOrEqual(2);
  });
});
