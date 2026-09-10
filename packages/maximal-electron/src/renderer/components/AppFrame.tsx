import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactElement,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';

import { ShellLayout, type ShellLayoutProps } from './ShellLayout.js';
import { getTabPanelId, getTabTriggerId, type Tab } from './TabBar.js';

interface FrameContextValue {
  railCollapsed: boolean;
  tabTriggerId: string;
  tabPanelId: string;
  top: HTMLElement | null;
  rail: HTMLElement | null;
  right: HTMLElement | null;
  status: HTMLElement | null;
}

const FrameContext = createContext<FrameContextValue | null>(null);

function useFrame(): FrameContextValue {
  const frame = useContext(FrameContext);
  if (frame === null) throw new Error('frame slots are only available inside AppFrame');
  return frame;
}

/** The active tab trigger id within the nearest application frame. */
export function useTabTriggerId(): string {
  return useFrame().tabTriggerId;
}

/** The active tab panel id within the nearest application frame. */
export function useTabPanelId(): string {
  return useFrame().tabPanelId;
}

/** Portal content into the full-width region below the title bar. */
export function SurfaceTop({ children }: { children: ReactNode }): ReactElement | null {
  const { top } = useFrame();
  return top === null ? null : createPortal(children, top);
}

/** Portal content into the left rail and receive its collapsed state. */
export function SurfaceRail({
  children,
}: {
  children: (collapsed: boolean) => ReactNode;
}): ReactElement | null {
  const { rail, railCollapsed } = useFrame();
  return rail === null ? null : createPortal(children(railCollapsed), rail);
}

/** Portal content into the optional right panel. */
export function SurfaceRight({ children }: { children: ReactNode }): ReactElement | null {
  const { right } = useFrame();
  return right === null ? null : createPortal(children, right);
}

/** Portal content into the optional status bar. */
export function SurfaceStatus({ children }: { children: ReactNode }): ReactElement | null {
  const { status } = useFrame();
  return status === null ? null : createPortal(children, status);
}

function RailCollapse({
  collapsed,
  onChange,
}: {
  collapsed: boolean;
  onChange: (collapsed: boolean) => void;
}): null {
  useEffect(() => onChange(collapsed), [collapsed, onChange]);
  return null;
}

export type AppFrameProps<T extends Tab> = Omit<
  ShellLayoutProps<T>,
  'top' | 'left' | 'main' | 'right' | 'status'
> & {
  children: ReactNode;
  withLeft?: boolean;
  withRight?: boolean;
  withStatus?: boolean;
};

/** A shell layout with portal-backed regions selected by its consumer. */
export function AppFrame<T extends Tab>({
  children,
  withLeft = false,
  withRight = false,
  withStatus = false,
  ...shell
}: AppFrameProps<T>): ReactElement {
  const [top, setTop] = useState<HTMLElement | null>(null);
  const [rail, setRail] = useState<HTMLElement | null>(null);
  const [right, setRight] = useState<HTMLElement | null>(null);
  const [status, setStatus] = useState<HTMLElement | null>(null);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const tabIdBase = `${shell.layoutId}-documents`;
  const frame = useMemo<FrameContextValue>(() => ({
    railCollapsed,
    tabTriggerId: getTabTriggerId(tabIdBase, shell.activeTab),
    tabPanelId: getTabPanelId(tabIdBase, shell.activeTab),
    top,
    rail,
    right,
    status,
  }), [railCollapsed, shell.activeTab, status, rail, right, tabIdBase, top]);

  return (
    <FrameContext.Provider value={frame}>
      <ShellLayout
        {...shell}
        top={<div ref={setTop} className="app-frame__slot" />}
        left={withLeft ? (collapsed) => (
          <>
            <RailCollapse collapsed={collapsed} onChange={setRailCollapsed} />
            <div ref={setRail} className="app-frame__slot app-frame__slot--rail" />
          </>
        ) : undefined}
        main={children}
        right={withRight
          ? <div ref={setRight} className="app-frame__slot app-frame__slot--fill" />
          : undefined}
        status={withStatus
          ? <div ref={setStatus} className="app-frame__slot app-frame__slot--contents" />
          : undefined}
      />
    </FrameContext.Provider>
  );
}