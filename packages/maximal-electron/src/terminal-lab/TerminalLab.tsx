import { RefreshCw, Square, SquareTerminal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Button, Dialog, IconButton, TextInput } from '../renderer/components/controls/index.js';
import { ShellLayout } from '../renderer/components/ShellLayout.js';
import type { Tab } from '../renderer/components/TabBar.js';
import { TerminalTabs } from '../renderer/components/TerminalTabs.js';
import {
  bridgeTerminalTransport,
  currentTerminalTheme,
} from '../renderer/lib/bridge-terminal.js';
import { bridge, useBridgeEvent } from '../renderer/lib/bridge.js';
import type { TerminalEmulatorKind } from '../renderer/lib/terminal-emulator.js';
import {
  decodeTabTransfer,
  moveTabBefore,
  TAB_TRANSFER_MIME,
} from '../renderer/lib/tab-transfer.js';
import {
  isTerminalPane,
  terminalPaneSessionIds,
  type TerminalPane,
} from '../renderer/lib/terminal-pane.js';
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
  const [frameId, setFrameId] = useState('');
  const [renameState, setRenameState] = useState<{ tabId: string; title: string }>();
  const initialLaunch = useRef(false);
  const launchPending = useRef(false);
  const detachedSessionId = useMemo(
    () => new URLSearchParams(window.location.search).get('sessionId'),
    [],
  );
  const detachedSessionTitle = useMemo(
    () => new URLSearchParams(window.location.search).get('title') ?? 'Detached terminal',
    [],
  );
  const detachedPane = useMemo<TerminalPane | undefined>(() => {
    const encoded = new URLSearchParams(window.location.search).get('pane');
    if (!encoded) return undefined;
    try {
      const candidate: unknown = JSON.parse(encoded);
      return isTerminalPane(candidate) ? candidate : undefined;
    } catch {
      return undefined;
    }
  }, []);
  const { tabs, setTabs, activeTab, setActiveTab, closeTab } = useShellTabs<LabTab>(
    detachedSessionId ? [] : [HOME_TAB],
    (existing) => newTerminalTab(existing),
  );
  const tabsRef = useRef(tabs);
  tabsRef.current = tabs;
  const panesRef = useRef(new Map<string, TerminalPane>());
  const paneRevisionsRef = useRef(new Map<string, number>());
  const closeTerminalTab = useCallback((id: string) => {
    if (detachedSessionId && tabsRef.current.length === 1) {
      window.close();
      return;
    }
    closeTab(id);
  }, [closeTab, detachedSessionId]);
  const current = tabs.find((tab) => tab.id === activeTab);
  useEffect(() => {
    void bridge.invoke('terminal:window-title', {
      title: current?.title ?? 'Terminal Lab',
    });
  }, [current?.title]);
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
      tab.id === tabId && tab.kind === 'terminal' && !tab.customTitle
        ? { ...tab, title: nextTitle }
        : tab,
    ));
  }, [setTabs]);

  const moveTerminalTab = useCallback((tabId: string, beforeTabId?: string) => {
    setTabs((existing) => moveTabBefore(existing, tabId, beforeTabId));
  }, [setTabs]);

  useEffect(() => {
    void bridge.invoke('terminal:frame-id').then(setFrameId);
    const unsubscribe = bridge.on('terminal:tab-redocked', ({ id, title, pane }) => {
      setTabs((existing) => {
        if (existing.some((tab) => tab.id === id)) return existing;
        const tab = {
          ...newTerminalTab(existing, id, title),
          customTitle: true,
        };
        if (pane && isTerminalPane(pane)) panesRef.current.set(tab.id, pane);
        setActiveTab(tab.id);
        return [...existing, tab];
      });
    });
    return unsubscribe;
  }, [setActiveTab, setTabs]);

  useBridgeEvent('terminal:pane-changed', ({ id, pane, revision }) => {
    if (!isTerminalPane(pane)) return;
    const tab = tabsRef.current.find((candidate) =>
      isTerminalTab(candidate) && candidate.sessionId === id);
    if (!tab) return;
    if (revision <= (paneRevisionsRef.current.get(tab.id) ?? 0)) return;
    panesRef.current.set(tab.id, pane);
    paneRevisionsRef.current.set(tab.id, revision);
    setTabs((existing) => [...existing]);
  });

  useEffect(() => {
    if (!detachedSessionId) return;
    setTabs((existing) => {
      if (existing.some((tab) => tab.kind === 'terminal' && tab.sessionId === detachedSessionId)) {
        return existing;
      }
      const tab = {
        ...newTerminalTab(existing, detachedSessionId, detachedSessionTitle),
        customTitle: true,
      };
      setActiveTab(tab.id);
      return [...existing, tab];
    });
    setPhase('running');
  }, [detachedSessionId, detachedSessionTitle, setActiveTab, setTabs]);

  /**
   * A drop naming a session this window already shows (its own copy, or the
   * tab this window was copied from) just recovers that tab instead of
   * redocking a second one for the same content.
   */
  const receiveTab = useCallback((transfer: { sessionId?: string; title?: string; pane?: TerminalPane; sourceFrameId: string }) => {
    if (!transfer.sessionId) return;
    const existing = tabsRef.current.find((candidate) =>
      isTerminalTab(candidate) && candidate.sessionId === transfer.sessionId);
    if (existing) {
      setActiveTab(existing.id);
      return;
    }
    void bridge.invoke('terminal:redock', {
      id: transfer.sessionId,
      cols: 80,
      rows: 24,
      sourceFrameId: transfer.sourceFrameId,
      targetFrameId: frameId,
      title: transfer.title ?? 'Detached terminal',
      sessionIds: transfer.pane
        ? terminalPaneSessionIds(transfer.pane)
        : [transfer.sessionId],
      pane: transfer.pane,
    });
  }, [frameId, setActiveTab]);

  useEffect(() => {
    if (!frameId) return;
    const onDragOver = (event: DragEvent) => {
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer || !dataTransfer.types.includes(TAB_TRANSFER_MIME)) return;
      event.preventDefault();
      dataTransfer.dropEffect = 'move';
    };
    const onDrop = (event: DragEvent) => {
      const dataTransfer = event.dataTransfer;
      if (!dataTransfer) return;
      const transfer = decodeTabTransfer(dataTransfer.getData(TAB_TRANSFER_MIME));
      if (!transfer?.sessionId || transfer.sourceFrameId === frameId) return;
      event.preventDefault();
      receiveTab(transfer);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [frameId, receiveTab]);

  const stop = useCallback(() => {
    if (!isTerminalTab(current)) return;
    closeTab(current.id);
    setPhase('stopped');
  }, [closeTab, current]);

  useEffect(() => {
    if (detachedSessionId) return;
    if (initialLaunch.current) return;
    initialLaunch.current = true;
    void addTerminal();
  }, [addTerminal, detachedSessionId]);

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
      onCloseTab={closeTerminalTab}
      onNewTab={() => void addTerminal()}
      tabsLabel="Terminal lab tabs"
      newTabLabel="New terminal tab"
      tabIcon={(tab) => tab.kind === 'terminal' ? SquareTerminal : undefined}
      tabTransfer={{
        frameId,
        canDrag: (tab) => tab.kind === 'terminal',
        canDropBefore: (tab) => tab === undefined || tab.kind === 'terminal',
        onMoveTab: moveTerminalTab,
        getTransfer: (tab) => {
          if (!isTerminalTab(tab)) return undefined;
          return {
            sessionId: tab.sessionId,
            pane: panesRef.current.get(tab.id),
            title: tab.title,
          };
        },
        contextMenu: (tab) => {
          if (!isTerminalTab(tab)) return [];
          return [
            {
              id: 'rename',
              label: 'Rename',
              onSelect: () => {
                setRenameState({ tabId: tab.id, title: tab.title });
              },
            },
            {
              id: 'move-to-new-window',
              label: 'Move to New Window',
              disabled: tabs.length < 2,
              onSelect: () => {
                void bridge.invoke('terminal:undock', {
                  id: tab.sessionId,
                  cols: 80,
                  rows: 24,
                  x: window.screenX + 100,
                  y: window.screenY + 100,
                  title: tab.title,
                  sessionIds: terminalPaneSessionIds(
                    panesRef.current.get(tab.id) ?? { sessionId: tab.sessionId },
                  ),
                  pane: panesRef.current.get(tab.id),
                }).then((moved) => {
                  if (moved) closeTab(tab.id);
                });
              },
            },
            {
              id: 'copy-to-new-window',
              label: 'Copy into New Window',
              shortcut: '⌘K O',
              onSelect: () => {
                void bridge.invoke('terminal:copy', {
                  id: tab.sessionId,
                  cols: 80,
                  rows: 24,
                  x: window.screenX + 100,
                  y: window.screenY + 100,
                  title: tab.title,
                  sessionIds: terminalPaneSessionIds(
                    panesRef.current.get(tab.id) ?? { sessionId: tab.sessionId },
                  ),
                  pane: panesRef.current.get(tab.id),
                });
              },
            },
            {
              id: 'close',
              label: 'Close',
              shortcut: '⌘W',
              separatorBefore: true,
              onSelect: () => {
                closeTerminalTab(tab.id);
              },
            },
          ];
        },
        onDetachTab: (transfer, position) => {
          const tab = tabsRef.current.find((candidate) => candidate.id === transfer.tabId);
          if (!isTerminalTab(tab)) return;
          void bridge.invoke('terminal:undock', {
              id: tab.sessionId,
              cols: 80,
              rows: 24,
              x: position.screenX,
              y: position.screenY,
              title: tab.title,
              sessionIds: terminalPaneSessionIds(
                panesRef.current.get(tab.id) ?? { sessionId: tab.sessionId },
              ),
              pane: panesRef.current.get(tab.id),
            }).then((moved) => {
              if (moved) closeTab(tab.id);
            });
        },
        onReceiveTab: receiveTab,
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
            disposition="detach"
            theme={currentTerminalTheme()}
            launchSplit={launchFixture}
            onExit={(tabId) => {
              closeTab(tabId);
              setPhase('exited');
            }}
            onPaneChange={(tabId, pane) => {
              const previous = panesRef.current.get(tabId);
              panesRef.current.set(tabId, pane);
              if (previous === pane) return;
              const tab = tabsRef.current.find((candidate) => candidate.id === tabId);
              if (!isTerminalTab(tab)) return;
              void bridge.invoke('terminal:pane-sync', { id: tab.sessionId, pane });
            }}
            initialPane={detachedPane}
            initialPanes={panesRef.current}
            paneRevisions={paneRevisionsRef.current}
            onTitleChange={updateTerminalTitle}
          />
        </main>
      )}
      top={(
        <Dialog
          open={renameState !== undefined}
          onOpenChange={(open) => {
            if (!open) setRenameState(undefined);
          }}
          title="Rename terminal tab"
          className="dialog"
          testId="rename-terminal-tab"
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!renameState) return;
              const title = terminalProcessTitle(renameState.title);
              if (title !== '') {
                setTabs((existing) => existing.map((tab) =>
                  tab.id === renameState.tabId && tab.kind === 'terminal'
                    ? { ...tab, title, customTitle: true }
                    : tab,
                ));
              }
              setRenameState(undefined);
            }}
          >
            <TextInput
              aria-label="Terminal tab name"
              value={renameState?.title ?? ''}
              onChange={(title) => setRenameState((state) => state ? { ...state, title } : state)}
            />
            <Button type="submit" variant="primary">Rename</Button>
          </form>
        </Dialog>
      )}
    />
  );
}