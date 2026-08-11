import { NavRail } from '@stuffbucket/maximal-electron/renderer';
import {
  Bot,
  CheckCircle2,
  CircleAlert,
  FolderGit2,
  Loader,
  ShieldQuestion,
} from 'lucide-react';
import type { ComponentType } from 'react';

import type { RunStatus } from './runs.js';
import {
  NAV_SECTIONS,
  type DemoNavEntry,
  type DemoViewId,
} from './views.js';

/** One icon per status bucket, so the Agents section reads at a glance. */
const STATUS_ICONS: Record<RunStatus, ComponentType<{ size?: number }>> = {
  running: Loader,
  blocked: ShieldQuestion,
  done: CheckCircle2,
  failed: CircleAlert,
};

function entryIcon(entry: DemoNavEntry): ComponentType<{ size?: number }> {
  if (entry.status) return STATUS_ICONS[entry.status];
  return entry.id === 'all' ? Bot : FolderGit2;
}

/** The demo left navigation: projects on top, agent status buckets below. */
export function AgentNav({
  view,
  onSelect,
  collapsed,
}: {
  view: DemoViewId;
  onSelect: (view: DemoViewId) => void;
  collapsed: boolean;
}) {
  return (
    <NavRail
      sections={NAV_SECTIONS}
      current={view}
      onSelect={onSelect}
      collapsed={collapsed}
      icon={entryIcon}
    />
  );
}
