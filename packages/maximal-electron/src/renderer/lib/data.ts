import type { ViewId } from '../../shared/ipc.js';

import type { Account } from './account.js';

/**
 * Sample content.
 *
 * A reference template needs enough data to make layout problems visible, and
 * no more. Replace this module with a real data source; nothing else in the
 * renderer reads from it directly.
 */

/**
 * Who the reference application says is signed in.
 *
 * Sample content, exactly like the rows below. A consumer passes their own
 * `Account` to `Profile`, and the shell learns nothing else about them.
 */
export const SAMPLE_ACCOUNT: Account = {
  id: 'sample-account',
  displayName: 'Avery Chen',
  handle: 'avery@example.com',
  plan: 'Pro',
};

export interface Item {
  id: string;
  name: string;
  kind: 'file' | 'component' | 'prototype';
  updated: string;
  size: string;
  author: string;
}

export interface NavSection {
  id: string;
  label: string;
  items: NavEntry[];
}

export interface NavEntry {
  id: ViewId;
  label: string;
  count: number;
}

export const NAV_SECTIONS: NavSection[] = [
  {
    id: 'workspace',
    label: 'Workspace',
    items: [
      { id: 'library', label: 'Library', count: 12 },
      { id: 'recents', label: 'Recents', count: 6 },
      { id: 'drafts', label: 'Drafts', count: 3 },
    ],
  },
  {
    id: 'team',
    label: 'Team',
    items: [
      { id: 'shared', label: 'Shared with me', count: 8 },
      { id: 'trash', label: 'Trash', count: 0 },
    ],
  },
];

const NAMES: NonEmpty<string> = [
  'Design system',
  'Marketing site',
  'Mobile onboarding',
  'Dashboard v2',
  'Icon set',
  'Brand guidelines',
  'Checkout flow',
  'Email templates',
  'Data viz kit',
  'Release notes',
  'Pricing page',
  'Component audit',
];

const KINDS: NonEmpty<Item['kind']> = ['file', 'component', 'prototype'];
const AUTHORS: NonEmpty<string> = ['Avery', 'Jordan', 'Sam', 'Riley'];

/**
 * A list the compiler knows has a first element.
 *
 * `noUncheckedIndexedAccess` types every index read as possibly undefined, so
 * `list[i % list.length]` needs a fallback that can never run. Declaring the
 * list non-empty removes the need for one, which removes the dead branch.
 */
type NonEmpty<T> = readonly [T, ...T[]];

/**
 * Read a list in a cycle, so an index of any size lands on a real element.
 *
 * The assertion carries what the type system cannot: a modulo by the length of
 * a non-empty list is always in range. Writing it as a fallback instead would
 * add a branch that can never run, which reads as untested rather than
 * unreachable.
 */
function cycle<T>(list: NonEmpty<T>, index: number): T {
  return list[index % list.length] as T;
}

/**
 * Deterministic sample rows. No randomness, so a screenshot test can baseline
 * this output.
 */
export function itemsFor(view: ViewId): Item[] {
  const counts: Record<ViewId, number> = {
    library: 12,
    recents: 6,
    drafts: 3,
    shared: 8,
    trash: 0,
  };

  return Array.from({ length: counts[view] }, (_unused, index) => ({
    id: `${view}-${index}`,
    name: cycle(NAMES, index),
    kind: cycle(KINDS, index),
    updated: `${index + 1} day${index === 0 ? '' : 's'} ago`,
    size: `${((index + 3) * 1.4).toFixed(1)} MB`,
    author: cycle(AUTHORS, index),
  }));
}

export const VIEW_LABELS: Record<ViewId, string> = {
  library: 'Library',
  recents: 'Recents',
  drafts: 'Drafts',
  shared: 'Shared with me',
  trash: 'Trash',
};
