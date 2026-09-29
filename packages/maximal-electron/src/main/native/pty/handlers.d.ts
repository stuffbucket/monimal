import type { BrowserWindow } from 'electron';

import type { PtyStatus, TerminalPane } from '@maximal/maximal-terminal';

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
    pane: TerminalPane,
    revision: number,
    origin: string,
  ) => void;
}

/** The handlers with their optional members filled in. */
export type PtyEvents = Required<PtyHandlers>;
