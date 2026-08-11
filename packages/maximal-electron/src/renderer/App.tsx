import { Component, FileText, Play, Sparkles, SquareTerminal } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ComponentType } from 'react';

import type { AppVersions, UpdateStatus, ViewId } from '../shared/ipc.js';

import { Canvas } from './components/Canvas.js';
import {
  Card,
  EmptyState,
  IconButton,
  Row,
  Toolbar,
  type ViewMode,
} from './components/Controls.js';
import { Inspector } from './components/Inspector.js';
import { LeftNav } from './components/LeftNav.js';
import { Profile } from './components/Profile.js';
import {
  ShellLayout,
  type PanelToggleSubscription,
} from './components/ShellLayout.js';
import {
  SettingsDialogs,
  SettingsSurfaceView,
  TAB_SURFACES,
  TAB_SURFACE_ICONS,
  tabSurface,
  useShellSettings,
} from './components/ShellSettings.js';
import { TerminalTabs } from './components/TerminalTabs.js';
import {
  bridgeTerminalTransport,
  currentTerminalTheme,
} from './lib/bridge-terminal.js';
import type { Tab } from './components/TabBar.js';
import type { Account } from './lib/account.js';
import { bridge, useBridgeEvent, usePreferences } from './lib/bridge.js';
import { SAMPLE_ACCOUNT, VIEW_LABELS, itemsFor, type Item } from './lib/data.js';
import type { SettingsSurface } from './lib/settings.js';
import { useShellTabs } from './lib/useShellTabs.js';
import { useDetachedTerminals } from './lib/useDetachedTerminals.js';
import { useThemePreference } from './lib/useThemePreference.js';

/**
 * The application shell.
 *
 * `ShellLayout` owns the three panels and their collapse. This component owns
 * everything the shell cannot know: what a tab is, what an item looks like, and
 * which navigation entry is current.
 */

/** A tab in this application. `kind` is ours, not the tab strip's. */
interface ShellTab extends Tab {
  kind: 'library' | 'terminal' | SettingsSurface;
}

const KIND_ICONS: Record<Item['kind'], ComponentType<{ size?: number }>> = {
  file: FileText,
  component: Component,
  prototype: Play,
};

/** A tab's icon, where it has one. A library tab is the plain case. */
const TAB_ICONS: Record<string, ComponentType<{ size?: number }>> = {
  terminal: SquareTerminal,
  ...TAB_SURFACE_ICONS,
};

function icon(item: Item, size = 28) {
  const Icon = KIND_ICONS[item.kind];
  return <Icon size={size} />;
}

/** The `+` button opens a terminal, numbered from the terminals already open. */
function newTerminal(existing: ShellTab[]): ShellTab {
  const count = existing.filter((tab) => tab.kind === 'terminal').length + 1;
  return terminalTab(`term-${String(count)}`);
}

/** `newTerminal` chose the id, so reattaching reads the number back out of it. */
function terminalTab(id: string): ShellTab {
  return { id, title: `Terminal ${id.replace('term-', '')}`, kind: 'terminal' };
}

const subscribeToPanelToggles: PanelToggleSubscription = (listener) =>
  bridge.on('menu:toggle-panel', ({ panel }) => listener(panel));

export function App() {
  const [view, setView] = useState<ViewId>('library');
  const [mode, setMode] = useState<ViewMode>('grid');
  const [selectedId, setSelectedId] = useState<string>();
  const [versions, setVersions] = useState<AppVersions>();
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ state: 'idle' });
  const [prefs, setPrefs] = usePreferences();

  // Identity is the consumer's. The reference application signs a sample
  // account in and out; a real one would ask its own provider.
  const [account, setAccount] = useState<Account | undefined>(SAMPLE_ACCOUNT);
  const [dialog, setDialog] = useState<SettingsSurface>();
  const settings = useShellSettings();

  const { tabs, setTabs, activeTab, setActiveTab, openTab, closeTab } = useShellTabs(
    [{ id: 'tab-1', title: 'Library', kind: 'library' }] as ShellTab[],
    newTerminal,
  );

  const items = useMemo(() => itemsFor(view), [view]);
  const selected = items.find((item) => item.id === selectedId);
  const current = tabs.find((tab) => tab.id === activeTab);

  const terminalIds = useMemo(
    () => tabs.filter((tab) => tab.kind === 'terminal').map((tab) => tab.id),
    [tabs],
  );
  const { detached, refresh } = useDetachedTerminals(
    bridgeTerminalTransport,
    terminalIds,
  );

  const reattachTerminal = useCallback(
    (id: string) => {
      setTabs((prev) => (prev.some((tab) => tab.id === id) ? prev : [...prev, terminalTab(id)]));
      setActiveTab(id);
    },
    [setActiveTab, setTabs],
  );

  /* ------------------------------------------------------------- effects */

  useEffect(() => {
    void bridge.invoke('app:versions').then(setVersions);
  }, []);

  // Keep the dock badge in step with the current view. This is the "dock icon
  // that coordinates" behaviour, driven by real application state.
  useEffect(() => {
    void bridge.invoke('dock:set-badge', { count: items.length });
  }, [items.length]);

  useThemePreference(prefs);

  /* ------------------------------------------------------- view switching */

  const goToView = useCallback(
    (next: ViewId) => {
      setView(next);
      setSelectedId(undefined);
      setTabs((prev) =>
        prev.map((tab) =>
          // Only a library tab tracks the current view. Renaming a terminal
          // tab here would relabel a running shell as "Trash".
          tab.id === activeTab && tab.kind === 'library'
            ? { ...tab, title: VIEW_LABELS[next] }
            : tab,
        ),
      );
    },
    [activeTab, setTabs],
  );

  /* ------------------------------------------------------ settings surfaces */

  /**
   * Where a profile-menu entry lands.
   *
   * The heavy surfaces open as tabs: they are wide, they are read rather than
   * operated, and they are worth leaving open. The keys and the app toggles
   * open as dialogs, because each is one bounded task — and the keys dialog
   * shows a secret, which should leave the screen when the task is done.
   *
   * A surface already open is focused rather than opened twice.
   */
  const openSurface = useCallback(
    (surface: SettingsSurface) => {
      const title = TAB_SURFACES[surface];
      if (title === undefined) {
        setDialog(surface);
        return;
      }

      setTabs((prev) =>
        prev.some((tab) => tab.id === surface)
          ? prev
          : [...prev, { id: surface, title, kind: surface }],
      );
      setActiveTab(surface);
    },
    [setActiveTab, setTabs],
  );

  /* -------------------------------------------------------------- events */

  useBridgeEvent('menu:navigate', ({ view: next }) => goToView(next));
  useBridgeEvent('update:status', setUpdateStatus);
  // A detached shell can end on its own, and nothing else would notice.
  useBridgeEvent('pty:exit', refresh);

  const checkUpdates = useCallback(() => {
    setUpdateStatus({ state: 'checking' });
    void bridge.invoke('update:check').then(setUpdateStatus);
  }, []);

  /* -------------------------------------------------------------- render */

  const surface = current === undefined ? undefined : tabSurface(current.kind);

  function renderMain() {
    if (surface !== undefined) {
      return (
        <SettingsSurfaceView surface={surface} settings={settings} versions={versions} />
      );
    }

    if (current?.kind === 'terminal') {
      return (
        <TerminalTabs
          ids={terminalIds}
          activeId={activeTab}
          transport={bridgeTerminalTransport}
          disposition={prefs?.terminalDetach ? 'detach' : 'terminate'}
          theme={currentTerminalTheme()}
        />
      );
    }

    return (
      <>
        <Toolbar title={VIEW_LABELS[view]} mode={mode} onModeChange={setMode} />
        <Canvas
          items={items}
          mode={mode}
          selectedId={selectedId}
          empty={<EmptyState icon={FileText} message="Nothing here yet." />}
          renderCard={(item, isSelected) => (
            <Card selected={isSelected} onSelect={() => setSelectedId(item.id)}>
              <span className="card__thumb">{icon(item)}</span>
              <span className="card__meta">
                <span className="card__name">{item.name}</span>
                <span className="card__sub">Edited {item.updated}</span>
              </span>
            </Card>
          )}
          renderRow={(item, isSelected) => (
            <Row selected={isSelected} onSelect={() => setSelectedId(item.id)}>
              {icon(item, 14)}
              <span className="row__name">{item.name}</span>
              <span className="row__sub">{item.author}</span>
              <span className="row__sub">{item.updated}</span>
              <span className="row__sub">{item.size}</span>
            </Row>
          )}
        />
      </>
    );
  }

  return (
    <>
    <ShellLayout
      layoutId="stuffbucket-shell"
      tabs={tabs}
      activeTab={activeTab}
      onSelectTab={setActiveTab}
      onCloseTab={closeTab}
      onNewTab={openTab}
      tabsLabel="Open documents"
      newTabLabel="New terminal tab"
      tabIcon={(tab) => TAB_ICONS[tab.kind]}
      titleBarActions={
        <>
          <IconButton
            label="Ask (summon overlay)"
            onClick={() => void bridge.invoke('overlay:toggle')}
            testId="toggle-overlay"
          >
            <Sparkles size={15} />
          </IconButton>
          <Profile
            account={account}
            onOpen={openSurface}
            onSignIn={() => {
              setAccount(SAMPLE_ACCOUNT);
            }}
            onSignOut={() => {
              setAccount(undefined);
            }}
          />
        </>
      }
      subscribeToPanelToggles={subscribeToPanelToggles}
      status={<span>{selected ? selected.name : 'No selection'}</span>}
      left={(collapsed) => (
        <LeftNav view={view} collapsed={collapsed} onSelect={goToView} />
      )}
      main={renderMain()}
      right={
        <Inspector
          item={selected}
          versions={versions}
          prefs={prefs}
          onPrefChange={setPrefs}
          updateStatus={updateStatus}
          onCheckUpdates={checkUpdates}
          detachedTerminals={detached}
          onReattachTerminal={reattachTerminal}
        />
      }
    />

    <SettingsDialogs
      surface={dialog}
      onClose={() => {
        setDialog(undefined);
      }}
      settings={settings}
    />
    </>
  );
}
