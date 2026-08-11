import { Sparkles } from 'lucide-react';
import { useState, type ComponentType } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import { getTabPanelId, getTabTriggerId, TabBar, type Tab } from './TabBar.js';

/**
 * The tab strip, at the widths where its rules actually show.
 *
 * A tab strip is mostly invisible until it is under pressure: one tab, many
 * tabs, a title too long for the space, a strip wider than the window. Those
 * are the states, so those are the stories.
 */

const SHORT: Tab[] = [
  { id: 'a', title: 'Library' },
  { id: 'b', title: 'Terminal 1' },
  { id: 'c', title: 'Terminal 2' },
];

const LONG: Tab[] = [
  { id: 'a', title: 'Library' },
  { id: 'b', title: 'refactor the provider discovery chain' },
  { id: 'c', title: 'components/controls/Overlays.stories.tsx' },
  { id: 'd', title: 'Terminal 1' },
];

const RUNS: Tab[] = [
  { id: 'a', title: 'refactor auth', status: 'running' },
  { id: 'b', title: 'flaky test triage', status: 'blocked' },
  { id: 'c', title: 'bump deps', status: 'done' },
  { id: 'd', title: 'migrate tokens', status: 'failed' },
];

/** One tab per name the shell sources, which is the whole registry. */
const SOURCED: Tab[] = [
  { id: 'a', title: 'Terminal 1', icon: 'terminal' },
  { id: 'b', title: 'notes.md', icon: 'document' },
  { id: 'c', title: 'src/renderer', icon: 'folder' },
  { id: 'd', title: 'Settings', icon: 'settings' },
];

/** A session strip under load: something running, something waiting for a human. */
const SESSIONS: Tab[] = [
  { id: 'a', title: 'deploy staging', icon: 'terminal', emphasis: 'busy' },
  { id: 'b', title: 'approve migration', icon: 'terminal', emphasis: 'attention' },
  { id: 'c', title: 'build docs', icon: 'terminal', status: 'running', emphasis: 'busy' },
  { id: 'd', title: 'idle shell', icon: 'terminal' },
];

function Strip({
  tabs,
  width,
  idBase = 'story',
  active: initial,
  label = 'Open documents',
  icon,
}: {
  tabs: Tab[];
  width: number;
  /** Distinct per strip, so two strips on one page do not share element IDs. */
  idBase?: string;
  active?: string;
  label?: string;
  /** The caller-supplied override. Most strips let `tab.icon` decide. */
  icon?: (tab: Tab) => ComponentType<{ size?: number }> | undefined;
}) {
  const [open, setOpen] = useState(tabs);
  const [active, setActive] = useState(initial ?? tabs[0]?.id ?? '');

  const close = (id: string) => {
    const rest = open.filter((tab) => tab.id !== id);
    setOpen(rest);
    if (id === active) setActive(rest[0]?.id ?? '');
  };

  return (
    <div style={{ width }}>
      {/*
       * The strip lives in the title bar, so it is shown on that surface, at a
       * real width, with the siblings it actually has.
       *
       * Not decoration: `.tabs` is `flex: 0 1 auto` and does not grow, so the
       * `titlebar__grow` spacer is what takes the slack. Without it the strip
       * sized to 400 of 640 and every tab truncated — a story that made the
       * component look broken when the component was fine.
       */}
      <div
        className="titlebar"
        style={{ height: 'var(--size-titlebar)', overflow: 'hidden' }}
      >
        <span className="titlebar__spacer-mac" />
        <TabBar
          tabIdBase={idBase}
          tabs={open}
          active={active}
          onSelect={setActive}
          onClose={close}
          onNew={() => undefined}
          icon={icon}
          label={label}
        />
        <span className="titlebar__grow" />
      </div>

      {/*
       * The panel is the context the strip requires. Only the active trigger
       * carries `aria-controls`, so one panel is the whole promise, and a
       * story without it shows the component making a promise nothing keeps.
       */}
      <div
        role="tabpanel"
        id={getTabPanelId(idBase, active)}
        aria-labelledby={getTabTriggerId(idBase, active)}
        tabIndex={0}
        style={{ padding: 'var(--space-4)', color: 'var(--text-secondary)' }}
      >
        {open.find((tab) => tab.id === active)?.title ?? 'Nothing open'}
      </div>
    </div>
  );
}

const meta = {
  title: 'Layout/TabBar',
  component: TabBar,
  args: {
    tabIdBase: 'story',
    tabs: SHORT,
    active: 'a',
    onSelect: () => undefined,
    onClose: () => undefined,
    onNew: () => undefined,
  },
  argTypes: {
    tabIdBase: { table: { disable: true } },
    tabs: { table: { disable: true } },
    icon: { table: { disable: true } },
  },
  render: (args) => <Strip tabs={args.tabs} width={640} />,
} satisfies Meta<typeof TabBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Room for everything. The separators are the only thing dividing them. */
export const Default: Story = {};

/**
 * The keyboard contract, which a screenshot cannot show.
 *
 * One tab stop for the strip, arrows to move without activating, `Delete` to
 * close the focused tab, and focus landing on its neighbour rather than on the
 * document body. The create and close controls sit outside the tablist,
 * because a tablist may own nothing but tabs.
 */
export const Keyboard: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const tablist = canvas.getByRole('tablist');
    const library = canvas.getByRole('tab', { name: 'Library' });

    await userEvent.click(library);
    await userEvent.keyboard('{ArrowRight}');
    const terminal = canvas.getByRole('tab', { name: 'Terminal 1' });
    await expect(terminal).toHaveFocus();
    await expect(terminal).toHaveAttribute('aria-selected', 'false');

    await userEvent.keyboard('{Delete}');
    await expect(canvas.queryByRole('tab', { name: 'Terminal 1' })).toBeNull();
    await expect(canvas.getByRole('tab', { name: 'Terminal 2' })).toHaveFocus();

    for (const name of ['New tab', 'Close Library']) {
      const control = canvas.getByRole('button', { name });
      await expect(tablist.contains(control)).toBe(false);
    }
  },
};

/** One tab has no close button: closing the last one is refused. */
export const Single: Story = {
  render: () => <Strip tabs={[{ id: 'a', title: 'Library' }]} width={640} />,
};

/**
 * Titles longer than a tab is allowed to be.
 *
 * Truncation fades rather than clipping to an ellipsis. An ellipsis says "this
 * is cut" and costs three characters to say it; a fade shows the same thing
 * with the characters it would have spent.
 */
export const Truncated: Story = {
  render: () => <Strip tabs={LONG} width={640} />,
};

/** Narrower than the strip wants. Tabs reach their minimum and then scroll. */
export const Crowded: Story = {
  render: () => <Strip tabs={LONG} width={380} />,
};

/** A status dot per tab, for a strip tracking things with a lifecycle. */
export const WithStatus: Story = {
  render: () => <Strip tabs={RUNS} width={640} />,
};

/**
 * The icons the shell sources, one per name in `TAB_ICON_NAMES`.
 *
 * A tab names its icon rather than carrying a component, because a tab is data:
 * it survives a session store and a `JSON.stringify`, and a function does not.
 */
export const WithSourcedIcons: Story = {
  render: () => <Strip tabs={SOURCED} width={640} />,
};

/**
 * An icon the shell does not source.
 *
 * The `icon` callback returns a component, so a consumer's own glyph needs no
 * file read, no bundler plugin and no registration. It wins the slot outright:
 * these tabs each name `document`, and none of them draws it.
 */
export const WithConsumerIcon: Story = {
  render: () => (
    <Strip
      tabs={SOURCED.map((tab) => ({ ...tab, icon: 'document' as const }))}
      width={640}
      icon={() => Sparkles}
    />
  ),
};

/**
 * Emphasis: what the tab says when a 7px dot is the wrong size to say it.
 *
 * Two treatments, and only two. `attention` is a rule down the leading edge,
 * full height, for a tab that needs a human — the approval gate in
 * stuffbucket/maximal#424. `busy` is a short bar travelling along the bottom,
 * for work still in flight. Geometry carries both, so neither depends on hue,
 * and `adornmentLabel` gives a screen reader the words.
 *
 * The third tab carries a status and an emphasis at once. The dot takes the
 * slot; the emphasis is drawn on the tab, so both are visible and the name
 * reads "build docs, Running, Working".
 */
export const WithEmphasis: Story = {
  render: () => <Strip tabs={SESSIONS} width={640} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    // The proof that the shape is not the whole message. A tab whose only
    // signal was a coloured bar would be findable by nothing but its title.
    await expect(canvas.getByRole('tab', { name: 'approve migration Needs attention' })).toBeVisible();
    await expect(canvas.getByRole('tab', { name: 'build docs Running, Working' })).toBeVisible();
  },
};

/** Emphasis on the selected tab, where it competes with the accent underline. */
export const EmphasisSelected: Story = {
  render: () => (
    <Strip tabs={SESSIONS} width={640} idBase="emphasis-selected" active="b" />
  ),
};

function Caption({ children }: { children: string }) {
  return (
    <p
      style={{
        margin: `var(--space-2) 0 0`,
        color: 'var(--text-muted)',
        font: 'var(--weight-base) var(--text-sm) / var(--leading-base) var(--font-body)',
      }}
    >
      {children}
    </p>
  );
}

/**
 * The four states, on one page, in whichever scheme the toolbar is set to.
 *
 * Rest and selected are both visible in any strip, because a strip always has
 * exactly one selected tab. Focus is put there by this story's `play`. Hover is
 * the one that cannot be frozen: no story can force a CSS pseudo-class without
 * a pseudo-states addon, so the third strip is one to point at.
 *
 * What to look for. Selected is a fill off the strip plus an accent along the
 * bottom edge, and the separators either side of it are gone. Hovered is the
 * same shape at a lower fill with no accent — near the selected tab, not equal
 * to it. Focused is hovered plus a ring, and the selection has not moved,
 * because arriving on a tab does not open it.
 */
export const States: Story = {
  render: () => (
    <div style={{ display: 'grid', gap: 'var(--space-5)', padding: 'var(--space-4)' }}>
      <div>
        <Strip
          tabs={SHORT}
          width={560}
          idBase="state-rest"
          active="b"
          label="Rest and selected"
        />
        <Caption>Rest and selected. Terminal 1 is the open document.</Caption>
      </div>
      <div>
        <Strip tabs={SHORT} width={560} idBase="state-hover" label="Hover" />
        <Caption>Hover. Point at Terminal 1, beside the selected Library.</Caption>
      </div>
      <div>
        <Strip tabs={SHORT} width={560} idBase="state-focus" label="Keyboard focus" />
        <Caption>Keyboard focus on Terminal 2. Library is still the open one.</Caption>
      </div>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const tab = canvasElement.querySelector<HTMLElement>(
      `#${CSS.escape(getTabTriggerId('state-focus', 'c'))}`,
    );
    // Not `userEvent.tab()`: focus has to land on a tab that is not the first,
    // and the point is the state, not the route to it.
    tab?.focus();
    await expect(tab).toHaveFocus();
    // Radix activates on Enter, so focus and selection are different things.
    // A ring that also selected would make this state impossible to show.
    await expect(tab).toHaveAttribute('aria-selected', 'false');
  },
};
