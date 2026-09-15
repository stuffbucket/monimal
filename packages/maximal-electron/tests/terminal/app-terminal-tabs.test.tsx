// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/renderer/components/Canvas.js', () => ({
  Canvas: () => <div data-testid="library" />,
}));

vi.mock('../../src/renderer/components/Controls.js', () => ({
  Card: () => null,
  EmptyState: () => null,
  Row: () => null,
  Toolbar: () => null,
}));

vi.mock('../../src/renderer/components/ShellLayout.js', () => ({
  ShellLayout: ({ tabs, activeTab, onSelectTab, main }: {
    tabs: { id: string }[];
    activeTab: string;
    onSelectTab: (id: string) => void;
    main: React.ReactNode;
  }) => (
    <>
      {tabs.map((tab) => (
        <button
          key={tab.id}
          data-active={tab.id === activeTab || undefined}
          data-testid={`select-${tab.id}`}
          onClick={() => onSelectTab(tab.id)}
        />
      ))}
      {main}
    </>
  ),
}));

vi.mock('../../src/renderer/components/ShellSettings.js', () => ({
  SettingsDialogs: () => null,
  SettingsSurfaceView: () => null,
  TAB_SURFACES: {},
  TAB_SURFACE_ICONS: {},
  tabSurface: () => undefined,
  useShellSettings: () => ({}),
}));

vi.mock('../../src/renderer/components/TerminalLauncher.js', () => ({
  TerminalLauncher: () => null,
}));

vi.mock('../../src/renderer/components/TerminalTabs.js', async () => {
  const { useState } = await import('react');
  return {
    TerminalTabs: ({ activeId }: { activeId: string }) => {
      const [paneCount, setPaneCount] = useState(1);
      return (
        <button
          data-active-id={activeId}
          data-testid="terminal-tabs"
          onClick={() => setPaneCount((count) => count + 1)}
        >
          {paneCount}
        </button>
      );
    },
  };
});

vi.mock('../../src/renderer/lib/bridge-terminal.js', () => ({
  bridgeTerminalTransport: {},
  currentTerminalTheme: () => ({}),
}));

vi.mock('../../src/renderer/lib/bridge.js', () => ({
  bridge: { invoke: vi.fn(async () => undefined) },
  useBridgeEvent: () => undefined,
  usePreferences: () => [undefined, vi.fn()],
}));

vi.mock('../../src/renderer/lib/useDetachedTerminals.js', () => ({
  useDetachedTerminals: () => ({ detached: [], refresh: vi.fn() }),
}));

vi.mock('../../src/renderer/lib/useShellTabs.js', async () => {
  const { useState } = await import('react');
  const initialTabs = [
    { id: 'library-tab', title: 'Library', kind: 'library' },
    { id: 'terminal-tab', title: 'Terminal', kind: 'terminal', sessionId: 'session-1' },
  ];
  return {
    useShellTabs: () => {
      const [tabs, setTabs] = useState(initialTabs);
      const [activeTab, setActiveTab] = useState('terminal-tab');
      return {
        tabs,
        setTabs,
        activeTab,
        setActiveTab,
        closeTab: vi.fn(),
      };
    },
  };
});

import { App } from '../../src/renderer/App.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('App terminal tabs', () => {
  it('keeps split state mounted while another tab is active', async () => {
    const element = document.createElement('div');
    const root = createRoot(element);

    await act(async () => root.render(<App />));

    const terminalTabs = element.querySelector('[data-testid="terminal-tabs"]') as HTMLButtonElement;
    await act(async () => terminalTabs.click());
    expect(terminalTabs.textContent).toBe('2');

    await act(async () => {
      (element.querySelector('[data-testid="select-library-tab"]') as HTMLButtonElement).click();
    });
    expect(element.querySelector('[data-testid="library"]')).not.toBeNull();
    expect(element.querySelector('[data-testid="terminal-tabs"]')?.textContent).toBe('2');
    expect(element.querySelector('[data-testid="terminal-tabs"]')?.getAttribute(
      'data-active-id',
    )).toBe('library-tab');

    await act(async () => {
      (element.querySelector('[data-testid="select-terminal-tab"]') as HTMLButtonElement).click();
    });
    expect(element.querySelector('[data-testid="terminal-tabs"]')?.textContent).toBe('2');

    await act(async () => root.unmount());
  });
});