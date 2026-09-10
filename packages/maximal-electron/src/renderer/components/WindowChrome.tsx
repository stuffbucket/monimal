import * as Tooltip from '@radix-ui/react-tooltip';
import { useState, type ReactElement, type ReactNode } from 'react';

import { ShellPortalRoot } from './controls/Overlays.js';
import { getTabPanelId, getTabTriggerId, type Tab } from './TabBar.js';
import { TitleBar } from './TitleBar.js';

export interface WindowChromeProps {
  layoutId: string;
  tab: Tab;
  children: ReactNode;
  tabsLabel?: string;
}

/** Draggable package chrome for one document without application navigation. */
export function WindowChrome({
  layoutId,
  tab,
  children,
  tabsLabel = 'Window',
}: WindowChromeProps): ReactElement {
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const tabIdBase = `${layoutId}-documents`;

  return (
    <Tooltip.Provider delayDuration={400}>
      <ShellPortalRoot element={root}>
        <div className="sb-shell app" ref={setRoot}>
          <TitleBar
            tabIdBase={tabIdBase}
            tabs={[tab]}
            activeTab={tab.id}
            onSelectTab={() => {}}
            tabsLabel={tabsLabel}
          />
          <div className="panel panel--canvas window-chrome__panel">
            <div
              className="tabpanel"
              role="tabpanel"
              id={getTabPanelId(tabIdBase, tab.id)}
              aria-labelledby={getTabTriggerId(tabIdBase, tab.id)}
              tabIndex={0}
            >
              <div className="canvas">{children}</div>
            </div>
          </div>
        </div>
      </ShellPortalRoot>
    </Tooltip.Provider>
  );
}