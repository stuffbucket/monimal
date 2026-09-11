import { RefreshCw, Square, SquareTerminal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { IconButton } from '../renderer/components/controls/index.js';
import { ShellLayout } from '../renderer/components/ShellLayout.js';
import type { Tab } from '../renderer/components/TabBar.js';
import { TerminalTabs } from '../renderer/components/TerminalTabs.js';
import {
  bridgeTerminalTransport,
  currentTerminalTheme,
} from '../renderer/lib/bridge-terminal.js';
import { bridge } from '../renderer/lib/bridge.js';
import type { TerminalEmulatorKind } from '../renderer/lib/terminal-emulator.js';
import { moveTabBefore } from '../renderer/lib/tab-transfer.js';
import {
  newTerminalTab,
  terminalProcessTitle,
  type TerminalShellTab,
} from '../renderer/lib/terminal-tab.js';
import { useShellTabs } from '../renderer/lib/useShellTabs.js';

type LabPhase = 'starting' | 'running' | 'exited' | 'failed' | 'stopped';

const PHASE_LABEL: Record<LabPhase, string> = {
  starting: 'Starting',
  running: 'Running',
  exited: 'Exited',
  failed: 'Failed',
  stopped: 'Stopped',
};

interface LabHomeTab extends Tab {
  kind: 'home';
}

type LabTab = LabHomeTab | TerminalShellTab;

const HOME_TAB: LabHomeTab = {
  id: 'terminal-lab',
  title: 'Terminal Lab',
  kind: 'home',
  closable: false,
};

function isTerminalTab(tab: LabTab | undefined): tab is TerminalShellTab {
  return tab?.kind === 'terminal';
}

export function TerminalLab() {
  const [emulator, setEmulator] = useState<TerminalEmulatorKind>('ghostty');
  const [phase, setPhase] = useState<LabPhase>('starting');
  const [failure, setFailure] = useState<string>();
  const initialLaunch = useRef(false);
  const launchPending = useRef(false);
  const { tabs, setTabs, activeTab, setActiveTab, closeTab } = useShellTabs<LabTab>(
    [HOME_TAB],
    (existing) => newTerminalTab(existing),
  );
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const current = tabs.find((tab) => tab.id === activeTab);
  const attachments = useMemo(
    () => tabs.flatMap((tab) =>
      tab.kind === 'terminal' ? [{ id: tab.id, sessionId: tab.sessionId }] : []),
    [tabs],
  );

  const launchFixture = useCallback(() => bridge.invoke('terminal:launch', {
    profileId: 'local',
    cols: 80,
    rows: 24,
  }), []);

  const addTerminal = useCallback(async () => {
    if (launchPending.current) return;
    launchPending.current = true;
    setPhase('starting');
    setFailure(undefined);
    try {
      const result = await launchFixture();
      const tab = newTerminalTab(tabsRef.current, result.sessionId, 'Fixture');
      setTabs((existing) => [...existing, tab]);
      setActiveTab(tab.id);
      setPhase('running');
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
      setPhase('failed');
    } finally {
      launchPending.current = false;
    }
  }, [launchFixture, setActiveTab, setTabs]);

  const restartActive = useCallback(async () => {
    if (!isTerminalTab(current)) return;
    const restartedId = current.id;
    setPhase('starting');
    setFailure(undefined);
    try {
      const result = await launchFixture();
      const existing = tabsRef.current;
      const index = existing.findIndex((tab) => tab.id === restartedId);
      if (index < 0) {
        await bridgeTerminalTransport.terminate(result.sessionId);
        return;
      }
      const replacement = newTerminalTab(existing, result.sessionId, 'Fixture');
      const next = [...existing];
      next[index] = replacement;
      setTabs(next);
      setActiveTab(replacement.id);
      setPhase('running');
    } catch (error) {
      setFailure(error instanceof Error ? error.message : String(error));
      setPhase('failed');
    }
  }, [current, launchFixture, setActiveTab, setTabs]);

  const updateTerminalTitle = useCallback((tabId: string, title: string) => {
    const nextTitle = terminalProcessTitle(title);
    if (nextTitle === '') return;
    setTabs((existing) => existing.map((tab) =>
      tab.id === tabId && tab.kind === 'terminal' ? { ...tab, title: nextTitle } : tab,
    ));
  }, [setTabs]);

  const moveTerminalTab = useCallback((tabId: string, beforeTabId?: string) => {
    setTabs((existing) => moveTabBefore(existing, tabId, beforeTabId));
  }, [setTabs]);

  const stop = useCallback(() => {
    if (!isTerminalTab(current)) return;
    closeTab(current.id);
    setPhase('stopped');
  }, [closeTab, current]);

  useEffect(() => {
    if (initialLaunch.current) return;
    initialLaunch.current = true;
    void addTerminal();
  }, [addTerminal]);

  function selectEmulator(next: TerminalEmulatorKind): void {
    if (next === emulator) return;
    setEmulator(next);
  }

  return (
    <ShellLayout
      layoutId="terminal-lab"
      tabs={tabs}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      onCloseTab={closeTab}
      onNewTab={() => void addTerminal()}
      tabsLabel="Terminal lab tabs"
      newTabLabel="New terminal tab"
      tabIcon={(tab) => tab.kind === 'terminal' ? SquareTerminal : undefined}
      tabTransfer={{
        frameId: 'terminal-lab',
        canDrag: (tab) => tab.kind === 'terminal',
        canDropBefore: (tab) => tab === undefined || tab.kind === 'terminal',
        onMoveTab: moveTerminalTab,
      }}
      titleBarLeading={(
        <div className="terminal-lab__status" data-phase={phase}>
          <span aria-hidden="true" />
          {failure ?? PHASE_LABEL[phase]}
        </div>
      )}
      titleBarActions={(
        <div className="terminal-lab__actions">
          <div className="segmented" role="group" aria-label="Terminal emulator">
            {(['ghostty', 'xterm'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                aria-pressed={emulator === kind}
                onClick={() => selectEmulator(kind)}
              >
                {kind === 'ghostty' ? 'Ghostty' : 'xterm.js'}
              </button>
            ))}
          </div>
          <IconButton
            label="Restart active terminal"
            onClick={() => void restartActive()}
            disabled={!isTerminalTab(current)}
          >
            <RefreshCw size={16} />
          </IconButton>
          <IconButton
            label="Close active terminal"
            danger
            onClick={stop}
            disabled={!isTerminalTab(current)}
          >
            <Square size={15} />
          </IconButton>
        </div>
      )}
      status={<span>{attachments.length} running terminal{attachments.length === 1 ? '' : 's'}</span>}
      main={(
        <main className="terminal-lab">
          {current?.kind === 'home' && (
            <div className="terminal-lab__empty">Terminal Lab</div>
          )}
          <TerminalTabs
            attachments={attachments}
            activeId={activeTab}
            emulator={emulator}
            transport={bridgeTerminalTransport}
            theme={currentTerminalTheme()}
            launchSplit={launchFixture}
            onExit={(tabId) => {
              closeTab(tabId);
              setPhase('exited');
            }}
            onTitleChange={updateTerminalTitle}
          />
        </main>
      )}
    />
  );
}