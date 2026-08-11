import * as Tooltip from '@radix-ui/react-tooltip';
import { PanelLeft, PanelRight } from 'lucide-react';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import {
  Group,
  Panel,
  Separator,
  useDefaultLayout,
  usePanelRef,
} from 'react-resizable-panels';

import { IconButton } from './controls/Button.js';
import { ShellPortalRoot } from './controls/Overlays.js';
import { TitleBar } from './TitleBar.js';
import {
  getTabPanelId,
  getTabTriggerId,
  type Tab,
  type TabStripProps,
} from './TabBar.js';

/**
 * The three-panel shell.
 *
 * A collapsible left rail, a tabbed document area, and a collapsible right
 * inspector, driven by `react-resizable-panels` v4. This component owns the
 * frame: the panel geometry, which panel is collapsed, and the menu event that
 * toggles one. It owns no content.
 *
 * It exists because the frame was written twice — once for the application and
 * once for the capture fixture — and the second copy was made for the only
 * reason a copy ever gets made here: there was nothing to import. A consumer of
 * this repository wanting the same layout would have made a third.
 *
 * The slots are named for where they are, not for what the application happens
 * to put in them. `left` is a render prop because it needs to know whether it
 * is collapsed; the others are plain nodes. `right` was a render prop too,
 * until the collapse button it existed to serve turned out to duplicate the
 * title bar's.
 */

/** A side panel's geometry. Sizes are strings in v4, not numbers. */
export interface PanelSize {
  default: string;
  min: string;
  max: string;
  collapsed: string;
}

export type ShellPanel = 'left' | 'right';
export type PanelToggleSubscription = (
  listener: (panel: ShellPanel) => void,
) => () => void;

/*
 * Pixels for the rail, percentages for the rest.
 *
 * A rail holds fixed-size icons and a label, so what it needs does not change
 * with the window. As a percentage the collapsed rail grew from 51px at 1280
 * to 67px around 16px icons, and the width at which it snapped shut moved with
 * the window too — which is most of why the collapse felt like it resisted.
 */
const LEFT: PanelSize = {
  default: '228px',
  min: '168px',
  max: '320px',
  collapsed: '48px',
};
const RIGHT: PanelSize = { default: '22', min: '16', max: '36', collapsed: '0' };
const BOTTOM: PanelSize = { default: '30', min: '10', max: '70', collapsed: '0' };

/**
 * The three-panel frame, with the tab strip in the title bar.
 *
 * It takes no children: every region is a named prop, and `left` is a function
 * receiving the collapsed state, because the rail's collapse is the frame's to
 * own and the content inside it is the caller's. `layoutId` is the key the
 * panel sizes persist under. `status` has no default; pass `null` for no
 * status bar.
 *
 * It applies `.sb-shell`, supplies the tooltip provider the icon buttons need,
 * and is the portal root the overlays mount into. Composing the smaller
 * exports without it means supplying all three yourself.
 */
export function ShellLayout<T extends Tab>({
  layoutId,
  tabs,
  activeTab,
  onSelectTab,
  onCloseTab,
  onNewTab,
  tabsLabel,
  newTabLabel,
  tabIcon,
  titleBarLeading,
  titleBarActions,
  subscribeToPanelToggles,
  top,
  left,
  main,
  bottom,
  right,
  status,
  leftSize = LEFT,
  rightSize = RIGHT,
  bottomSize = BOTTOM,
}: {
  /** Namespaces the persisted panel sizes. Two shells must not share one. */
  layoutId: string;
  /** Caller-owned content before the sidebar toggle. */
  titleBarLeading?: ReactNode;
  /** Caller-owned actions before the inspector toggle. */
  titleBarActions?: ReactNode;
  /** Optional host event adapter, such as an Electron menu subscription. */
  subscribeToPanelToggles?: PanelToggleSubscription;
  /**
   * Full width, under the title bar and over the panels. For anything that
   * addresses the whole window rather than one panel: an offline banner, an
   * update prompt, a failed-save notice.
   */
  top?: ReactNode;
  left: (collapsed: boolean) => ReactNode;
  main: ReactNode;
  /**
   * Under `main`, in the same column, behind a draggable divider. For a
   * secondary view of what `main` shows: logs, output, a console. Absent by
   * default, and when absent the centre column is a plain panel rather than a
   * group of one.
   */
  bottom?: ReactNode;
  right: ReactNode;
  status: ReactNode;
  leftSize?: PanelSize;
  rightSize?: PanelSize;
  bottomSize?: PanelSize;
} & Omit<TabStripProps<T>, 'tabIdBase'>) {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  // State rather than a ref: a portal has to re-render once the element the
  // shell class sits on exists.
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const tabIdBase = `${layoutId}-documents`;

  const leftPanel = usePanelRef();
  const rightPanel = usePanelRef();
  const bottomPanel = usePanelRef();

  // Persists panel sizes to `localStorage`, so a reload restores the layout
  // with no storage code here.
  const layout = useDefaultLayout({
    id: layoutId,
    panelIds: ['left', 'main', 'right'],
  });

  // A second, independent layout for the centre column's split. Only created
  // when there is something to split.
  const columnLayout = useDefaultLayout({
    id: `${layoutId}-column`,
    panelIds: ['main', 'bottom'],
  });

  const togglePanel = useCallback(
    (panel: ShellPanel) => {
      const handle = panel === 'left' ? leftPanel.current : rightPanel.current;
      if (!handle) return;
      if (handle.isCollapsed()) handle.expand();
      else handle.collapse();
    },
    [leftPanel, rightPanel],
  );

  useEffect(() => {
    if (!subscribeToPanelToggles) return;
    return subscribeToPanelToggles(togglePanel);
  }, [subscribeToPanelToggles, togglePanel]);

  const documentPanel = (
    <div
      className="tabpanel"
      role="tabpanel"
      id={getTabPanelId(tabIdBase, activeTab)}
      aria-labelledby={getTabTriggerId(tabIdBase, activeTab)}
      tabIndex={0}
    >
      {main}
    </div>
  );

  return (
    <Tooltip.Provider delayDuration={400}>
      <ShellPortalRoot element={root}>
        <div className="sb-shell app" ref={setRoot}>
          <TitleBar
            tabIdBase={tabIdBase}
            leading={
              <>
                {titleBarLeading}
                <IconButton
                  label={leftCollapsed ? 'Show sidebar' : 'Hide sidebar'}
                  onClick={() => togglePanel('left')}
                  active={!leftCollapsed}
                  testId="toggle-left"
                >
                  <PanelLeft size={15} />
                </IconButton>
              </>
            }
            actions={
              <>
                {titleBarActions}
                <IconButton
                  label={rightCollapsed ? 'Show panel' : 'Hide panel'}
                  onClick={() => togglePanel('right')}
                  active={!rightCollapsed}
                  testId="toggle-right"
                >
                  <PanelRight size={15} />
                </IconButton>
              </>
            }
            tabs={tabs}
            activeTab={activeTab}
            onSelectTab={onSelectTab}
            onCloseTab={onCloseTab}
            onNewTab={onNewTab}
            tabsLabel={tabsLabel}
            newTabLabel={newTabLabel}
            tabIcon={tabIcon}
          />

          {top}

          <Group
            orientation="horizontal"
            className="panels"
            defaultLayout={layout.defaultLayout}
            onLayoutChanged={layout.onLayoutChanged}
          >
            <Panel
              id="left"
              panelRef={leftPanel}
              defaultSize={leftSize.default}
              minSize={leftSize.min}
              maxSize={leftSize.max}
              collapsible
              collapsedSize={leftSize.collapsed}
              onResize={() =>
                setLeftCollapsed(leftPanel.current?.isCollapsed() ?? false)
              }
              className="panel"
            >
              {left(leftCollapsed)}
            </Panel>

            <Separator className="resize-handle" />

            <Panel id="main" minSize="30" className="panel panel--canvas">
              {bottom === undefined ? (
                documentPanel
              ) : (
                <Group
                  orientation="vertical"
                  className="column"
                  defaultLayout={columnLayout.defaultLayout}
                  onLayoutChanged={columnLayout.onLayoutChanged}
                >
                  <Panel id="main" minSize="20" className="panel panel--canvas">
                    {documentPanel}
                  </Panel>
                  <Separator className="resize-handle resize-handle--horizontal" />
                  <Panel
                    id="bottom"
                    panelRef={bottomPanel}
                    defaultSize={bottomSize.default}
                    minSize={bottomSize.min}
                    maxSize={bottomSize.max}
                    collapsible
                    collapsedSize={bottomSize.collapsed}
                    className="panel panel--drawer"
                  >
                    {bottom}
                  </Panel>
                </Group>
              )}
              <footer className="statusbar">
                {status}
                <span className="statusbar__grow" />
              </footer>
            </Panel>

            <Separator className="resize-handle" />

            <Panel
              id="right"
              panelRef={rightPanel}
              defaultSize={rightSize.default}
              minSize={rightSize.min}
              maxSize={rightSize.max}
              collapsible
              collapsedSize={rightSize.collapsed}
              onResize={() =>
                setRightCollapsed(rightPanel.current?.isCollapsed() ?? false)
              }
              className="panel"
            >
              {right}
            </Panel>
          </Group>
        </div>
      </ShellPortalRoot>
    </Tooltip.Provider>
  );
}
