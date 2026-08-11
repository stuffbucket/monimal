import type { ITheme } from 'ghostty-web';
import { useState, type ReactNode } from 'react';
import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import type { TerminalTransport } from '../lib/terminal-transport.js';
import { TabBar, getTabPanelId, getTabTriggerId, type Tab } from './TabBar.js';
import { TerminalTabs } from './TerminalTabs.js';
import type { TerminalHost } from './TerminalView.js';
import {
  bufferContaining,
  cannedTransport,
  DARK,
  terminalOf,
} from './TerminalView.stories.js';

/**
 * Several sessions at once, with the inactive ones hidden rather than unmounted.
 *
 * That distinction is the component. Scrollback lives in the emulator and dies
 * with it, so unmounting an inactive tab would throw away everything above the
 * fold, and a user coming back would find a terminal that had forgotten its own
 * build. `hidden` takes the host out of layout and leaves the emulator, the
 * buffer and the session alone.
 *
 * The transport is `cannedTransport` from the `TerminalView` stories: no
 * Electron, no pty, no host process. One per session, so each tab prints
 * something of its own and `Switching` can tell them apart.
 */

const IDS = ['tab-build', 'tab-test', 'tab-deploy'];

const OUTPUT: Record<string, string> = {
  'tab-build': 'avery:~/work/shell $ npm run build:package\r\n\r\n  ok  built in 4.0s\r\n',
  'tab-test': 'avery:~/work/shell $ npm test\r\n\r\n  ok  412 passed\r\n',
  'tab-deploy': 'avery:~/work/shell $ npm run deploy staging\r\n\r\n  waiting for approval\r\n',
};

/** One canned session per id, behind the single transport the component takes. */
function sessionTransport(): TerminalTransport {
  const sessions = new Map(
    IDS.map((id) => [id, cannedTransport(OUTPUT[id] ?? '')] as const),
  );
  const of = (id: string) => sessions.get(id);

  return {
    spawn: (descriptor) => of(descriptor.id)?.spawn(descriptor) ?? Promise.resolve(),
    write: (id, data) => of(id)?.write(id, data) ?? Promise.resolve(),
    resize: (id, cols, rows) => of(id)?.resize(id, cols, rows) ?? Promise.resolve(),
    terminate: (id) => of(id)?.terminate(id) ?? Promise.resolve(),
    subscribe: (id, listener) => of(id)?.subscribe(id, listener) ?? (() => undefined),
  };
}

/**
 * The `terminate` branch of `TerminalTabsProps`, written out.
 *
 * Same reason as `TerminalViewArgs` next door: the prop type is a union,
 * because `detach` demands a transport that can list its sessions, and
 * Storybook reduces a union of object types to `never` when it infers args
 * from one.
 */
interface TerminalTabsArgs {
  ids: string[];
  activeId: string;
  shell?: string;
  theme?: ITheme;
  transport: TerminalTransport;
}

/** The panel the tabs fill. The height matters: each host is `flex: 1` of it. */
function Panel({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 300, width: 720 }}>
      {children}
    </div>
  );
}

/**
 * The nth host in document order, which is `ids` order.
 *
 * Every view here carries the default `testId`, because `TerminalTabs` does not
 * pass one down, so position is what distinguishes three terminals. A missing
 * one throws rather than becoming an assertion against `undefined`.
 */
function hostAt(canvasElement: HTMLElement, index: number): TerminalHost {
  const found = canvasElement.querySelectorAll<TerminalHost>('.terminal-host > .terminal');
  const host = found[index];
  if (!host) {
    throw new Error(
      `nothing to read: wanted terminal ${String(index)} of ${String(found.length)}`,
    );
  }
  return host;
}

const meta = {
  title: 'Terminal/TerminalTabs',
  component: TerminalTabs,
  args: {
    ids: IDS,
    activeId: 'tab-build',
    shell: '/bin/zsh',
    theme: DARK,
    transport: sessionTransport(),
  },
  argTypes: {
    transport: { table: { disable: true } },
    theme: { table: { disable: true } },
  },
  decorators: [(Story) => <Panel>{Story()}</Panel>],
} satisfies Meta<TerminalTabsArgs>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Three sessions open, one on screen.
 *
 * Two of the three hosts carry `hidden`, and the active one has its own output
 * in it. A screenshot shows half of that, because the interesting two are
 * drawing nothing anybody can see.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const open = canvasElement.querySelectorAll('.terminal-host');
    await expect(open).toHaveLength(3);
    await expect([...open].filter((host) => host.hasAttribute('hidden'))).toHaveLength(2);

    await bufferContaining(hostAt(canvasElement, 0), 'build:package');
  },
};

/** One session, which is what a shell opens with. */
export const One: Story = {
  args: { ids: ['tab-build'], activeId: 'tab-build' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('.terminal-host')).toHaveLength(1);
    await bufferContaining(hostAt(canvasElement, 0), 'built in 4.0s');
  },
};

/**
 * `ids` is empty: every terminal has been closed.
 *
 * The component draws nothing rather than an empty frame, and that is the
 * answer to a question a consumer will ask. The host owns the panel and decides
 * what belongs in it when there is no session, so a caller who wants a
 * placeholder here draws it themselves.
 */
export const NoSessions: Story = {
  args: { ids: [], activeId: '' },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelectorAll('.terminal-host')).toHaveLength(0);
  },
};

const ID_BASE = 'terminal-tabs-story';

const STRIP: Tab[] = [
  { id: 'tab-build', title: 'build', icon: 'terminal' },
  { id: 'tab-test', title: 'test', icon: 'terminal' },
  { id: 'tab-deploy', title: 'deploy', icon: 'terminal' },
];

function Switcher() {
  const [transport] = useState(sessionTransport);
  const [active, setActive] = useState('tab-build');

  return (
    <>
      <div className="titlebar" style={{ height: 'var(--size-titlebar)' }}>
        <TabBar
          tabIdBase={ID_BASE}
          tabs={STRIP}
          active={active}
          onSelect={setActive}
          onClose={() => undefined}
          onNew={() => undefined}
          label="Terminal sessions"
        />
        <span className="titlebar__grow" />
      </div>
      {/*
       * The panel the strip promises. Only the active trigger carries
       * `aria-controls`, so one panel is the whole promise, and without it the
       * attribute points at nothing — which axe reports as `aria-valid-attr-value`
       * and which is the story's fault rather than the component's.
       */}
      <div
        role="tabpanel"
        id={getTabPanelId(ID_BASE, active)}
        aria-labelledby={getTabTriggerId(ID_BASE, active)}
        style={{ display: 'flex', flex: 1, minHeight: 0 }}
      >
        <TerminalTabs ids={IDS} activeId={active} theme={DARK} transport={transport} />
      </div>
    </>
  );
}

/**
 * Switching tabs, and the session surviving it.
 *
 * The regression this is written against: a strip that unmounted the inactive
 * view would look identical here, and differ only on the way back, when the
 * buffer is empty and the shell is a new one. So `play` takes the first
 * emulator instance, leaves for another tab, comes back, and asserts the host
 * is carrying the same object with the same buffer in it. Object identity is
 * the part a screenshot cannot reach.
 */
export const Switching: StoryObj = {
  render: () => <Switcher />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const build = hostAt(canvasElement, 0);
    const before = await terminalOf(build);
    await bufferContaining(build, 'built in 4.0s');

    await userEvent.click(canvas.getByRole('tab', { name: 'deploy' }));
    const shown = [...canvasElement.querySelectorAll('.terminal-host')].filter(
      (host) => !host.hasAttribute('hidden'),
    );
    await expect(shown).toHaveLength(1);
    await expect(shown[0]?.contains(build)).toBe(false);

    await userEvent.click(canvas.getByRole('tab', { name: 'build' }));
    // Nothing respawned, so everything in this buffer was written before the
    // two clicks above.
    await expect(build.__terminal).toBe(before);
    await expect(await bufferContaining(build, 'built in 4.0s')).toContain('build:package');
  },
};
