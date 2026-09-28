import type { BrowserWindow } from 'electron';

import type { PtyStatus } from '@maximal/maximal-terminal';
import type { TerminalPaneLayout } from '../../../shared/ipc.js';

export interface PtyHandlers {
  emit: (
    owner: BrowserWindow,
    id: string,
    chunk: string,
    sequence?: number,
    projectionId?: string,
  ) => void;
  onExit: (
    owner: BrowserWindow,
    id: string,
    exitCode: number,
    projectionId?: string,
  ) => void;
  onStatus: (owner: BrowserWindow, status: PtyStatus) => void;
  onSize?: (
    owner: BrowserWindow,
    id: string,
    cols: number,
    rows: number,
    projectionId?: string,
  ) => void;
  onPane?: (
    owner: BrowserWindow,
    id: string,
    pane: TerminalPaneLayout,
    revision: number,
    origin: string,
  ) => void;
}

/** The handlers with their optional members filled in. */
export type PtyEvents = Required<PtyHandlers>;
