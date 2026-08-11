import type { ReactNode } from 'react';

import { TabBar, type Tab, type TabStripProps } from './TabBar.js';

/**
 * A draggable title bar that hosts document tabs and caller-owned controls.
 *
 * The leading and actions slots deliberately know nothing about Electron IPC or
 * product features. Their wrappers opt every injected control out of the drag
 * region, including links and custom interactive elements.
 */
export function TitleBar<T extends Tab>({
  leading,
  actions,
  tabIdBase,
  tabs,
  activeTab,
  onSelectTab,
  onCloseTab,
  onNewTab,
  tabsLabel,
  newTabLabel,
  tabIcon,
}: {
  leading?: ReactNode;
  actions?: ReactNode;
} & TabStripProps<T>) {
  const isMac =
    typeof navigator !== 'undefined' && navigator.userAgent.includes('Mac');

  return (
    <header className="titlebar" data-testid="titlebar">
      {isMac && <span className="titlebar__spacer-mac" />}
      {leading !== undefined && (
        <div className="titlebar__leading">{leading}</div>
      )}

      <TabBar
        tabIdBase={tabIdBase}
        tabs={tabs}
        active={activeTab}
        onSelect={onSelectTab}
        onClose={onCloseTab}
        onNew={onNewTab}
        label={tabsLabel}
        newLabel={newTabLabel}
        icon={tabIcon}
      />

      {/* Empty space stays draggable, so the window still moves by its bar. */}
      <span className="titlebar__grow" />
      {actions !== undefined && (
        <div className="titlebar__actions">{actions}</div>
      )}

      {/* Windows and Linux reserve room for the titleBarOverlay controls. */}
      {!isMac && <span className="titlebar__spacer-win" />}
    </header>
  );
}
