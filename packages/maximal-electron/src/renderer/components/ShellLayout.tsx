import { PanelLeft, PanelRight } from 'lucide-react';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  Group,
  type Layout,
  type LayoutChangedMeta,
  Panel,
  Separator,
  useDefaultLayout,
  useGroupRef,
  usePanelRef,
} from 'react-resizable-panels';
import { IconButton } from './controls/Button.js';
import {
  ShellPortalRoot,
  TooltipProvider,
} from './controls/Overlays.js';
import { TitleBar } from './TitleBar.js';
import {
  getTabPanelId,
  getTabTriggerId,
  type Tab,
  type TabStripProps,
} from './TabBar.js';
import { SHELL_PANEL_SIZES, type PanelSize } from '../lib/panel-sizes.js';

export type { PanelSize };

export type ShellPanel = 'left' | 'right';
export type PanelToggleSubscription = (
  listener: (panel: ShellPanel) => void,
) => () => void;

const PANEL_IDS: Record<'both' | 'left' | 'right' | 'neither', string[]> = {
  both: ['left', 'main', 'right'],
  left: ['left', 'main'],
  right: ['main', 'right'],
  neither: ['main'],
};

function layoutForPanels(layout: Layout | undefined, panelIds: string[]): Layout | undefined {
  if (layout === undefined) return undefined;
  const layoutIds = Object.keys(layout);
  return layoutIds.length === panelIds.length
    && panelIds.every((panelId) => Object.hasOwn(layout, panelId))
    ? layout
    : undefined;
}

/**
 * The application frame, with the tab strip in the title bar.
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
export type ShellLayoutProps<T extends Tab> = {
  /** Namespaces persisted panel sizes and tab accessibility ids. */
  layoutId: string;
  /** Caller-owned content before the sidebar toggle. */
  titleBarLeading?: ReactNode;
  /** Caller-owned actions before the inspector toggle. */
  titleBarActions?: ReactNode;
  /** Accessible name for a surface that is not represented by a document tab. */
  documentLabel?: string;
  /** Optional host event adapter, such as an Electron menu subscription. */
  subscribeToPanelToggles?: PanelToggleSubscription;
  top?: ReactNode;
  activity?: ReactNode;
  left?: (collapsed: boolean) => ReactNode;
  main: ReactNode;
  bottom?: ReactNode;
  right?: ReactNode;
  status?: ReactNode;
  /** Initial panel geometry used only when no persisted layout exists. */
  initialDocumentLayout?: Layout;
  leftSize?: PanelSize;
  rightSize?: PanelSize;
  bottomSize?: PanelSize;
} & Omit<TabStripProps<T>, 'tabIdBase'>;

/** The low-level resizable shell geometry and tabbed document primitive. */
export function ShellLayout<T extends Tab>({
  layoutId,
  tabs,
  activeTab,
  onSelectTab,
  onCloseTab,
  onRenameTab,
  onNewTab,
  tabsLabel,
  newTabLabel,
  tabIcon,
  tabTransfer,
  titleBarLeading,
  titleBarActions,
  documentLabel,
  subscribeToPanelToggles,
  top,
  activity,
  left,
  main,
  bottom,
  right,
  status,
  initialDocumentLayout,
  leftSize = SHELL_PANEL_SIZES.sidebar,
  rightSize = SHELL_PANEL_SIZES.inspector,
  bottomSize = SHELL_PANEL_SIZES.drawer,
}: ShellLayoutProps<T>) {
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  // State rather than a ref: a portal has to re-render once the element the
  // shell class sits on exists.
  const [root, setRoot] = useState<HTMLDivElement | null>(null);
  const tabIdBase = `${layoutId}-documents`;
  const hasLeft = left !== undefined;
  const hasRight = right !== undefined;
  const documentStructure = hasLeft
    ? (hasRight ? 'both' : 'left')
    : (hasRight ? 'right' : 'neither');

  const leftPanel = usePanelRef();
  const rightPanel = usePanelRef();
  const bottomPanel = usePanelRef();
  const documentGroup = useGroupRef();
  const topologyDefaultLayouts = useRef(new Map<string, Layout>());
  const documentPanelIds = PANEL_IDS[documentStructure];
  const documentLayoutId = `${layoutId}:tab:${encodeURIComponent(activeTab)}:${documentStructure}`;
  const documentTopologyId = `${layoutId}:${documentStructure}`;
  const layout = useDefaultLayout({
    id: documentLayoutId,
    panelIds: documentPanelIds,
  });
  const defaultDocumentLayout = layoutForPanels(layout.defaultLayout, documentPanelIds);
  const initialLayout = layoutForPanels(initialDocumentLayout, documentPanelIds);

  useLayoutEffect(() => {
    let topologyDefault = topologyDefaultLayouts.current.get(documentTopologyId);
    if (topologyDefault === undefined) {
      topologyDefault = layoutForPanels(
        documentGroup.current?.getLayout(),
        documentPanelIds,
      );
      if (topologyDefault !== undefined) {
        topologyDefaultLayouts.current.set(documentTopologyId, topologyDefault);
      }
    }
    const nextLayout = defaultDocumentLayout ?? initialLayout ?? topologyDefault;
    if (nextLayout !== undefined) {
      documentGroup.current?.setLayout(nextLayout);
    }
    setLeftCollapsed(leftPanel.current?.isCollapsed() ?? false);
    setRightCollapsed(rightPanel.current?.isCollapsed() ?? false);
  }, [
    activeTab,
    defaultDocumentLayout,
    documentGroup,
    documentPanelIds,
    documentTopologyId,
    initialLayout,
    leftPanel,
    rightPanel,
  ]);

  // A second, independent layout for the centre column's split. Only created
  // when there is something to split.
  const columnLayout = useDefaultLayout({
    id: `${layoutId}-column`,
    panelIds: ['main', 'bottom'],
  });

  const onDocumentLayoutChanged = useCallback((nextLayout: Layout, meta: LayoutChangedMeta) => {
    const validLayout = layoutForPanels(nextLayout, documentPanelIds);
    if (validLayout === undefined) return;
    layout.onLayoutChanged(validLayout, meta);
  }, [documentPanelIds, layout]);

  const togglePanel = useCallback(
    (panel: ShellPanel) => {
      const handle = panel === 'left' ? leftPanel.current : rightPanel.current;
      if (!handle) return;
      const collapsed = panel === 'left' ? leftCollapsed : rightCollapsed;
      if (collapsed) handle.resize(panel === 'left' ? leftSize.default : rightSize.default);
      else handle.collapse();
      const nextLayout = layoutForPanels(
        documentGroup.current?.getLayout(),
        documentPanelIds,
      );
      if (nextLayout !== undefined) {
        layout.onLayoutChanged(nextLayout, { isUserInteraction: true });
      }
      if (panel === 'left') setLeftCollapsed(!collapsed);
      else setRightCollapsed(!collapsed);
    },
    [
      leftCollapsed,
      leftPanel,
      leftSize.default,
      documentGroup,
      documentPanelIds,
      layout,
      rightCollapsed,
      rightPanel,
      rightSize.default,
    ],
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
      aria-labelledby={tabs.some(({ id }) => id === activeTab)
        ? getTabTriggerId(tabIdBase, activeTab)
        : undefined}
      aria-label={tabs.some(({ id }) => id === activeTab)
        ? undefined
        : documentLabel}
    >
      {main}
    </div>
  );

  return (
    <TooltipProvider>
      <ShellPortalRoot element={root}>
        <div className="sb-shell app" ref={setRoot}>
          <TitleBar
            tabIdBase={tabIdBase}
            leading={
              <>
                {titleBarLeading}
                {hasLeft && (
                  <IconButton
                    label={leftCollapsed ? 'Show sidebar' : 'Hide sidebar'}
                    onClick={() => togglePanel('left')}
                    active={!leftCollapsed}
                    testId="toggle-left"
                  >
                    <PanelLeft size={16} />
                  </IconButton>
                )}
              </>
            }
            actions={
              <>
                {titleBarActions}
                {hasRight && (
                  <IconButton
                    label={rightCollapsed ? 'Show panel' : 'Hide panel'}
                    onClick={() => togglePanel('right')}
                    active={!rightCollapsed}
                    testId="toggle-right"
                  >
                    <PanelRight size={16} />
                  </IconButton>
                )}
              </>
            }
            tabs={tabs}
            activeTab={activeTab}
            onSelectTab={onSelectTab}
            onCloseTab={onCloseTab}
            onRenameTab={onRenameTab}
            onNewTab={onNewTab}
            tabsLabel={tabsLabel}
            newTabLabel={newTabLabel}
            tabIcon={tabIcon}
            tabTransfer={tabTransfer}
          />

          {top}

          <div className="shell-workspace">
            {activity !== undefined && (
              <aside className="activity-rail">{activity}</aside>
            )}
            <Group
              key={`${layoutId}:${documentStructure}`}
              groupRef={documentGroup}
              orientation="horizontal"
              className="panels"
              onLayoutChanged={onDocumentLayoutChanged}
            >
            {hasLeft && (
              <>
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
              </>
            )}

            <Panel
              id="main"
              minSize={SHELL_PANEL_SIZES.canvas.minWidth}
              className="panel panel--canvas"
            >
              {bottom === undefined ? (
                documentPanel
              ) : (
                <Group
                  orientation="vertical"
                  className="column"
                  defaultLayout={columnLayout.defaultLayout}
                  onLayoutChanged={columnLayout.onLayoutChanged}
                >
                  <Panel
                    id="main"
                    minSize={SHELL_PANEL_SIZES.canvas.minHeight}
                    className="panel panel--canvas"
                  >
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
              {status !== null && status !== undefined && (
                <footer className="statusbar">
                  {status}
                  <span className="statusbar__grow" />
                </footer>
              )}
            </Panel>

            {hasRight && (
              <>
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
              </>
            )}
            </Group>
          </div>
        </div>
      </ShellPortalRoot>
    </TooltipProvider>
  );
}
