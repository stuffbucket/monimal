import {
  FileText,
  Folder,
  Globe,
  Map as MapIcon,
  Settings,
  SquareTerminal,
  type LucideIcon,
} from 'lucide-react';

import type { TabIconName } from './tab-adornment.js';

/** Stable icon names rendered consistently by shell-owned navigation. */
export const SHELL_ICON_NAMES = [
  'browser',
  'document',
  'folder',
  'map',
  'settings',
  'terminal',
] as const;

export type ShellIconName = (typeof SHELL_ICON_NAMES)[number];

const SHELL_ICON_GLYPHS: Record<ShellIconName, LucideIcon> = {
  browser: Globe,
  document: FileText,
  folder: Folder,
  map: MapIcon,
  settings: Settings,
  terminal: SquareTerminal,
};

/** The Lucide glyph assigned to a semantic shell icon name. */
export function shellIcon(name: ShellIconName): LucideIcon {
  return SHELL_ICON_GLYPHS[name];
}

/** The shared shell glyph for a serializable tab icon name. */
export function tabIcon(name: TabIconName): LucideIcon {
  return shellIcon(name);
}
