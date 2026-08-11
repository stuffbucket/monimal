import {
  Clock,
  FileText,
  FolderOpen,
  Trash2,
  Users,
} from 'lucide-react';
import type { ComponentType } from 'react';

import type { ViewId } from '../../shared/ipc.js';
import { NAV_SECTIONS } from '../lib/data.js';

import { NavRail } from './NavRail.js';

const ICONS: Record<ViewId, ComponentType<{ size?: number }>> = {
  library: FolderOpen,
  recents: Clock,
  drafts: FileText,
  shared: Users,
  trash: Trash2,
};

/** The application's left navigation: the workspace and team sections. */
export function LeftNav({
  view,
  onSelect,
  collapsed,
}: {
  view: ViewId;
  onSelect: (view: ViewId) => void;
  collapsed: boolean;
}) {
  return (
    <NavRail
      sections={NAV_SECTIONS}
      current={view}
      onSelect={onSelect}
      collapsed={collapsed}
      icon={(entry) => ICONS[entry.id]}
    />
  );
}
