import {
  ShellLayout,
  TerminalTabs,
  Toolbar,
  useShellTabs,
  useThemePreference,
  type Tab,
  type ViewMode,
} from '@stuffbucket/maximal-electron/renderer';
import { useCallback, useState, useMemo } from 'react';

import {
  DEFAULT_VIEW,
  runsFor,
  viewLabel,
  type DemoViewId,
} from './views.js';
import { RUNS } from './runs.js';

import { AgentNav } from './AgentNav.js';
import {
  demoTerminalTheme,
  demoTerminalTransport,
  useHostTheme,
} from './host.js';
import { RunCanvas } from './RunCanvas.js';
import { RunInspector } from './RunInspector.js';

/**
 * The demo shell: the same three panels, orchestrating a fleet of agents.
 *
 * `STUFFBUCKET_DEMO=1` makes the main process load this fixture's own renderer
 * bundle instead of the product's. It is a separate tree on purpose. The
 * production `App` keeps its own data path untouched, and this one is free to
 * be a screenshot fixture.
 *
 * The chrome is shared, and shared the way a dependent project shares it:
 * every import resolves through `@stuffbucket/maximal-electron`'s own
 * `exports` map, which is the map a registry install resolves through. Nothing
 * here reaches into `src/`, and `npm run verify:fixture-imports` fails if it
 * ever does again. So this really is the first consumer of those primitives,
 * and it defines the `--shell-*` contract itself in `demo.css`.
 */

/** A tab in the fleet: a run, or a terminal somebody opened. */
interface FleetTab extends Tab {
  kind: 'run' | 'terminal';
}

/** Concurrent agent sessions, as they would sit in the tab strip. */
const SESSION_TABS: FleetTab[] = [
  { id: 'run-101', title: 'refactor auth', kind: 'run', status: 'running' },
  { id: 'run-102', title: 'flaky test triage', kind: 'run', status: 'blocked' },
  { id: 'run-103', title: 'bump deps', kind: 'run', status: 'running' },
];

function newTerminal(existing: FleetTab[]): FleetTab {
  const count = existing.filter((tab) => tab.kind === 'terminal').length + 1;
  return {
    id: `term-${String(count)}`,
    title: `Terminal ${String(count)}`,
    kind: 'terminal',
  };
}

/**
 * A deterministic, impersonal shell for the demo terminal.
 *
 * The login shell would drag the developer's prompt, plugins, and username into
 * a published screenshot.
 */
const DEMO_SHELL = navigator.userAgent.includes('Windows')
  ? undefined
  : '/bin/sh';

export function DemoApp() {
  const [view, setView] = useState<DemoViewId>(DEFAULT_VIEW);
  /*
   * A fleet opens as a queue, not as a wall of cards.
   *
   * The grid fits seven of seventeen runs, and an operator watching agents
   * wants to see all of them and what each is waiting on. The list does that
   * in one screen. The grid is still a click away, and the production shell
   * still opens on the grid, because documents are things you recognise by
   * sight and runs are things you read.
   */
  const [mode, setMode] = useState<ViewMode>('list');
  const [selectedId, setSelectedId] = useState<string>();
  const theme = useHostTheme();

  const { tabs, activeTab, setActiveTab, openTab, closeTab } = useShellTabs(
    SESSION_TABS,
    newTerminal,
  );

  const runs = useMemo(() => runsFor(view), [view]);
  const selected = RUNS.find((run) => run.id === selectedId);
  const current = tabs.find((tab) => tab.id === activeTab);

  useThemePreference(theme);

  /** Activating a session tab selects the run it is following. */
  const selectTab = useCallback(
    (id: string) => {
      setActiveTab(id);
      if (RUNS.some((run) => run.id === id)) setSelectedId(id);
    },
    [setActiveTab],
  );

  return (
    <ShellLayout
      layoutId="stuffbucket-demo"
      tabs={tabs}
      activeTab={activeTab}
      onSelectTab={selectTab}
      onCloseTab={closeTab}
      onNewTab={openTab}
      rightSize={{ default: '24', min: '16', max: '36', collapsed: '0' }}
      status={<span>{selected ? selected.branch : 'No run selected'}</span>}
      left={(collapsed) => (
        <AgentNav view={view} collapsed={collapsed} onSelect={setView} />
      )}
      main={
        current?.kind === 'terminal' ? (
          <TerminalTabs
            ids={tabs.filter((tab) => tab.kind === 'terminal').map((tab) => tab.id)}
            activeId={activeTab}
            shell={DEMO_SHELL}
            transport={demoTerminalTransport}
            theme={demoTerminalTheme()}
          />
        ) : (
          <>
            <Toolbar title={viewLabel(view)} mode={mode} onModeChange={setMode} />
            <RunCanvas
              runs={runs}
              mode={mode}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          </>
        )
      }
      right={<RunInspector run={selected} onSelect={setSelectedId} />}
    />
  );
}
