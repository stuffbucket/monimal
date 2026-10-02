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
import {
  StatusProvider,
  StatusViewport,
  useStatuses,
} from './Status.js';
import { getTabPanelId, getTabTriggerId, type Tab } from './TabBar.js';

interface FrameContextValue {
  railCollapsed: boolean;
  tabTriggerId: string;
  tabPanelId: string;
  top: HTMLElement | null;
  activity: HTMLElement | null;
  rail: HTMLElement | null;
  right: HTMLElement | null;
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

/** Portal content into the persistent activity rail beside the collapsible panels. */
export function SurfaceActivity({ children }: { children: ReactNode }): ReactElement | null {
  const { activity } = useFrame();
  return activity === null ? null : createPortal(children, activity);
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
  'top' | 'activity' | 'left' | 'main' | 'right' | 'status'
> & {
  children: ReactNode;
  withActivity?: boolean;
  withLeft?: boolean;
  withRight?: boolean;
};

function AppFrameLayout<T extends Tab>({
  children,
  withActivity = false,
  withLeft = false,
  withRight = false,
  ...shell
}: AppFrameProps<T>): ReactElement {
  const [top, setTop] = useState<HTMLElement | null>(null);
  const [activity, setActivity] = useState<HTMLElement | null>(null);
  const [rail, setRail] = useState<HTMLElement | null>(null);
  const [right, setRight] = useState<HTMLElement | null>(null);
  const [railCollapsed, setRailCollapsed] = useState(false);
  const statuses = useStatuses();
  const tabIdBase = `${shell.layoutId}-documents`;
  const frame = useMemo<FrameContextValue>(() => ({
    railCollapsed,
    tabTriggerId: getTabTriggerId(tabIdBase, shell.activeTab),
    tabPanelId: getTabPanelId(tabIdBase, shell.activeTab),
    top,
    activity,
    rail,
    right,
  }), [activity, railCollapsed, shell.activeTab, rail, right, tabIdBase, top]);

  return (
    <FrameContext.Provider value={frame}>
      <ShellLayout
        {...shell}
        top={<div ref={setTop} className="app-frame__slot" />}
        activity={withActivity
          ? <div ref={setActivity} className="app-frame__slot app-frame__slot--fill" />
          : undefined}
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
        status={statuses.length > 0 ? <StatusViewport /> : null}
      />
    </FrameContext.Provider>
  );
}

/** A shell layout with portal-backed regions and a content-driven status host. */
export function AppFrame<T extends Tab>(props: AppFrameProps<T>): ReactElement {
  return (
    <StatusProvider>
      <AppFrameLayout {...props} />
    </StatusProvider>
  );
}