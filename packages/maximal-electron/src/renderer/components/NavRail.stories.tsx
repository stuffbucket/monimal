import {
  Bot,
  CheckCircle2,
  CircleAlert,
  Clock,
  FileText,
  FolderOpen,
  Loader,
  ShieldQuestion,
  Trash2,
  Users,
} from 'lucide-react';
import { useState } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect } from 'storybook/test';

import { NavRail, type NavRailSection } from './NavRail.js';

/**
 * The navigation rail, with both of its call sites side by side.
 *
 * The application's rail and the capture fixture's rail differ only in their
 * data and their icons, which is the claim `NavRail` makes. Two stories is the
 * cheapest way to keep that claim honest: if the generic form ever stops
 * fitting one of them, it stops fitting here first.
 */

type AppView = 'library' | 'recents' | 'drafts' | 'shared' | 'trash';

const APP_SECTIONS: NavRailSection<AppView>[] = [
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

const APP_ICONS = {
  library: FolderOpen,
  recents: Clock,
  drafts: FileText,
  shared: Users,
  trash: Trash2,
} as const;

type FleetStatus = 'running' | 'blocked' | 'done' | 'failed';

const FLEET_SECTIONS: NavRailSection<string, FleetStatus>[] = [
  {
    id: 'projects',
    label: 'Projects',
    items: [
      { id: 'project:core', label: 'core', count: 6 },
      { id: 'project:shell', label: 'shell', count: 4 },
      { id: 'project:macos-builder', label: 'macos-builder', count: 5 },
      { id: 'project:wiggle', label: 'wiggle', count: 2 },
    ],
  },
  {
    id: 'agents',
    label: 'Agents',
    items: [
      { id: 'all', label: 'All runs', count: 17 },
      { id: 'status:running', label: 'Running', count: 6, status: 'running' },
      { id: 'status:blocked', label: 'Needs approval', count: 3, status: 'blocked' },
      { id: 'status:done', label: 'Done', count: 7, status: 'done' },
      { id: 'status:failed', label: 'Failed', count: 1, status: 'failed' },
    ],
  },
];

const FLEET_ICONS = {
  running: Loader,
  blocked: ShieldQuestion,
  done: CheckCircle2,
  failed: CircleAlert,
} as const;

const LONG_LABEL_SECTIONS: NavRailSection<'aurora'>[] = [
  {
    id: 'projects',
    label: 'Projects',
    items: [{ id: 'aurora', label: 'Placeholder Project — Aurora', count: 128 }],
  },
];

function Frame({ collapsed, children }: { collapsed: boolean; children: React.ReactNode }) {
  return (
    <div
      className="panel"
      style={{
        // The widths the shell actually gives it, from the tokens.
        width: collapsed ? 'var(--nav-collapsed)' : 'var(--nav-default)',
        height: 420,
        border: '1px solid var(--border-subtle)',
      }}
    >
      {children}
    </div>
  );
}

function AppRail({ collapsed }: { collapsed: boolean }) {
  const [view, setView] = useState<AppView>('library');
  return (
    <Frame collapsed={collapsed}>
      <NavRail
        sections={APP_SECTIONS}
        current={view}
        onSelect={setView}
        collapsed={collapsed}
        icon={(entry) => APP_ICONS[entry.id]}
      />
    </Frame>
  );
}

function FleetRail({ collapsed }: { collapsed: boolean }) {
  const [view, setView] = useState('all');
  return (
    <Frame collapsed={collapsed}>
      <NavRail
        sections={FLEET_SECTIONS}
        current={view}
        onSelect={setView}
        collapsed={collapsed}
        icon={(entry) =>
          entry.status ? FLEET_ICONS[entry.status] : entry.id === 'all' ? Bot : FolderOpen
        }
      />
    </Frame>
  );
}

const meta = {
  title: 'Layout/NavRail',
  component: AppRail,
  args: { collapsed: false },
  argTypes: { collapsed: { control: 'boolean' } },
  parameters: {
    // `component` is the wrapper that holds the selection state, so autodocs
    // has no docstring to read. Three consumers in a row reported that the
    // rail could not draw labelled collapsible groups, and this page was one
    // of the places that did not say otherwise.
    docs: {
      description: {
        component:
          'A list of labelled groups. Each `NavRailSection` draws a heading ' +
          'that collapses the entries under it, and each `NavRailEntry` draws ' +
          'an icon, a label, a count and an optional status dot. A navigation ' +
          'of several groups is data, not markup.',
      },
    },
  },
} satisfies Meta<typeof AppRail>;

export default meta;

/** The application's own rail: two sections, no status. */
export const Application: StoryObj<typeof meta> = {};

/**
 * The capture fixture's rail: two labelled groups, four projects and five
 * status filters, coloured icons, colons in ids. This is the whole of what a
 * consumer writes for it — the data above and one `NavRail` element.
 */
export const AgentFleet: StoryObj<typeof meta> = {
  render: (args) => <FleetRail collapsed={args.collapsed} />,
};

/** Collapsed to an icon rail. The panel width is the caller's; this is the state. */
export const Collapsed: StoryObj<typeof meta> = {
  args: { collapsed: true },
};

function LongLabelRail() {
  return (
    <Frame collapsed={false}>
      <NavRail
        sections={LONG_LABEL_SECTIONS}
        current="aurora"
        onSelect={() => undefined}
        collapsed={false}
        icon={() => FolderOpen}
      />
    </Frame>
  );
}

/**
 * A label longer than the rail is wide.
 *
 * Issue #176: `.nav__label` had no rule of its own, so a long project name
 * wrapped and overlapped the row below rather than truncating — the example
 * in the issue, `Placeholder Project — Aurora`, is reused here. The fix
 * replicates `.tab__label`'s reasoning: a flex item's `min-width` defaults to
 * its content's width, so `min-width: 0` is what lets the label shrink below
 * its own text and hand the overflow to `text-overflow: ellipsis` at all.
 *
 * This is the computed-layout proof: the label's own text is wider than its
 * box (there is something to truncate), the row itself is not, and the count
 * keeps its place at the trailing edge rather than being pushed out.
 */
export const LongLabel: StoryObj<typeof meta> = {
  render: () => <LongLabelRail />,
  play: async ({ canvasElement }) => {
    const item = canvasElement.querySelector<HTMLElement>('[data-testid="nav-aurora"]');
    const label = item?.querySelector<HTMLElement>('.nav__label');
    const count = item?.querySelector<HTMLElement>('.nav__item-count');
    if (!item || !label || !count) {
      throw new Error('nothing to measure: the nav item, its label or its count did not render');
    }

    // The floor. A label with nothing to truncate would satisfy every
    // comparison below by having nowhere to overflow from.
    await expect(label.scrollWidth, 'the label text is wider than its own box').toBeGreaterThan(
      label.clientWidth,
    );

    const itemRect = item.getBoundingClientRect();
    const labelRect = label.getBoundingClientRect();
    const countRect = count.getBoundingClientRect();

    // Truncated inside the row, not overflowing it.
    await expect(item.scrollWidth, 'the row itself does not overflow').toBeLessThanOrEqual(
      item.clientWidth + 1,
    );
    await expect(
      labelRect.right,
      `label right ${String(Math.round(labelRect.right))}, count left ${String(Math.round(countRect.left))}`,
    ).toBeLessThanOrEqual(countRect.left + 0.5);

    // The count keeps its place at the trailing edge, rather than being
    // pushed out by an unbounded label.
    await expect(
      countRect.right,
      `count right ${String(Math.round(countRect.right))}, row right ${String(Math.round(itemRect.right))}`,
    ).toBeLessThanOrEqual(itemRect.right + 0.5);
  },
};
