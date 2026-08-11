import { describe, expect, it } from 'vitest';

import type { ViewId } from '../src/shared/ipc.js';
import {
  NAV_SECTIONS,
  SAMPLE_ACCOUNT,
  VIEW_LABELS,
  itemsFor,
} from '../src/renderer/lib/data.js';

/**
 * Sample data.
 *
 * These tests exist because mutation testing showed the module had no unit
 * coverage at all: 77 mutants survived untouched. It is only sample content,
 * but two properties are load-bearing.
 *
 * 1. **Determinism.** The end-to-end screenshots baseline this output. Any
 *    randomness or wall-clock use here makes those tests flap.
 * 2. **Counts.** The navigation badges and the end-to-end assertions both
 *    read them, so they have to agree with each other.
 */

const VIEWS: ViewId[] = ['library', 'recents', 'drafts', 'shared', 'trash'];

describe('SAMPLE_ACCOUNT', () => {
  it('is a whole identity, so the profile menu has every line to draw', () => {
    // Pinned rather than probed: a name without a handle or a plan would leave
    // two of the menu header's three rows untested by every story that uses it.
    expect(SAMPLE_ACCOUNT).toEqual({
      id: 'sample-account',
      displayName: 'Avery Chen',
      handle: 'avery@example.com',
      plan: 'Pro',
    });
  });
});

describe('itemsFor', () => {
  it('returns the documented count for each view', () => {
    expect(itemsFor('library')).toHaveLength(12);
    expect(itemsFor('recents')).toHaveLength(6);
    expect(itemsFor('drafts')).toHaveLength(3);
    expect(itemsFor('shared')).toHaveLength(8);
    expect(itemsFor('trash')).toHaveLength(0);
  });

  it('is deterministic across calls', () => {
    // The screenshot tests depend on this. A random id or a `Date.now()`
    // anywhere in the module breaks them in a way that looks like a UI bug.
    for (const view of VIEWS) {
      expect(itemsFor(view)).toEqual(itemsFor(view));
    }
  });

  it('gives every item a unique id', () => {
    for (const view of VIEWS) {
      const ids = itemsFor(view).map((item) => item.id);
      expect(new Set(ids).size).toBe(ids.length);
    }
  });

  it('namespaces ids by view, so two views never collide', () => {
    const all = VIEWS.flatMap((view) => itemsFor(view).map((item) => item.id));
    expect(new Set(all).size).toBe(all.length);
  });

  it('fills every field with a non-empty value', () => {
    for (const item of itemsFor('library')) {
      expect(item.name).not.toBe('');
      expect(item.author).not.toBe('');
      expect(item.updated).not.toBe('');
      expect(item.size).not.toBe('');
      expect(['file', 'component', 'prototype']).toContain(item.kind);
    }
  });

  it('cycles names by modulo, not by any other index arithmetic', () => {
    // Pin the actual values. Asserting only "non-empty" lets a wrong index
    // expression pass, because the defensive fallback fills the gap.
    const names = itemsFor('library').map((item) => item.name);
    expect(names.slice(0, 3)).toEqual([
      'Design system',
      'Marketing site',
      'Mobile onboarding',
    ]);
    // 12 items over 12 names means every name appears exactly once.
    expect(new Set(names).size).toBe(12);
  });

  it('cycles authors by modulo', () => {
    const authors = itemsFor('library').map((item) => item.author);
    expect(authors.slice(0, 5)).toEqual([
      'Avery',
      'Jordan',
      'Sam',
      'Riley',
      'Avery',
    ]);
  });

  it('computes size from the index, and formats it to one decimal', () => {
    // (index + 3) * 1.4, to one decimal place.
    const sizes = itemsFor('library').map((item) => item.size);
    expect(sizes.slice(0, 3)).toEqual(['4.2 MB', '5.6 MB', '7.0 MB']);
    // Growing, so a sign flip or a division is visible.
    expect(sizes.every((size) => /^\d+\.\d MB$/.test(size))).toBe(true);
  });

  it('pluralises the first item correctly', () => {
    // "1 day ago", then "2 days ago". An off-by-one here is visible in every
    // card, so it is worth pinning.
    const [first, second] = itemsFor('library');
    expect(first?.updated).toBe('1 day ago');
    expect(second?.updated).toBe('2 days ago');
  });

  it('cycles kinds so a view shows more than one icon', () => {
    const kinds = new Set(itemsFor('library').map((item) => item.kind));
    expect(kinds.size).toBeGreaterThan(1);
  });

  it('returns a fresh array, so a caller cannot corrupt later calls', () => {
    const first = itemsFor('drafts');
    first.pop();
    expect(itemsFor('drafts')).toHaveLength(3);
  });
});

describe('VIEW_LABELS', () => {
  it('labels every view with a non-empty string', () => {
    for (const view of VIEWS) {
      expect(VIEW_LABELS[view]).toBeTruthy();
    }
  });

  it('uses distinct labels, so a tab title identifies its view', () => {
    const labels = VIEWS.map((view) => VIEW_LABELS[view]);
    expect(new Set(labels).size).toBe(labels.length);
  });
});

describe('NAV_SECTIONS', () => {
  it('covers every view exactly once', () => {
    const listed = NAV_SECTIONS.flatMap((section) =>
      section.items.map((entry) => entry.id),
    );
    expect([...listed].sort()).toEqual([...VIEWS].sort());
  });

  it('agrees with itemsFor on every count', () => {
    // The badge in the navigation and the number of cards on screen are read
    // from two different places. They must not drift apart.
    for (const section of NAV_SECTIONS) {
      for (const entry of section.items) {
        expect(entry.count, `${entry.id} badge`).toBe(itemsFor(entry.id).length);
      }
    }
  });

  it('gives every section a label and at least one entry', () => {
    for (const section of NAV_SECTIONS) {
      expect(section.label).toBeTruthy();
      expect(section.items.length).toBeGreaterThan(0);
    }
  });

  it('gives every section a unique, non-empty id', () => {
    // Section ids are React keys. An empty or duplicated one makes the list
    // render wrongly rather than throw.
    const ids = NAV_SECTIONS.map((section) => section.id);
    for (const id of ids) expect(id).not.toBe('');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('gives every entry a non-empty, distinct label', () => {
    // The label is the only thing the user reads in the sidebar.
    const labels = NAV_SECTIONS.flatMap((section) =>
      section.items.map((entry) => entry.label),
    );
    for (const label of labels) expect(label).not.toBe('');
    expect(new Set(labels).size).toBe(labels.length);
  });
});
