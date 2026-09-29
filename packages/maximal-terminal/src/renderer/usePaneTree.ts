import { useEffect, useRef, useState } from 'react';

import {
  removeTerminalPane,
  splitTerminalPane,
  terminalPaneSessionIds,
  type TerminalPane,
  type TerminalSplitDirection,
} from '../pane.js';
import type {
  DetachableTerminalTransport,
  TerminalTransport,
} from './transport.js';

/** A renderer tab attached to one opaque terminal session. */
export interface TerminalAttachment {
  id: string;
  sessionId: string;
}

export type TerminalPaneTreeSession =
  | { disposition: 'terminate'; transport: TerminalTransport }
  | { disposition: 'detach'; transport: DetachableTerminalTransport };

export interface TerminalPaneTreeOptions {
  attachment: TerminalAttachment;
  session: TerminalPaneTreeSession;
  launchSplit?: () => Promise<{ sessionId: string }>;
  onExit?: (tabId: string) => void;
  onSessionsChange?: (tabId: string, sessionIds: string[]) => void;
  onFocusChange?: (tabId: string, sessionId: string) => void;
  onPaneChange?: (tabId: string, pane: TerminalPane, baseRevision: number) => void;
  initialPane?: TerminalPane;
  initialPaneRevision?: number;
  onTitleChange?: (tabId: string, title: string) => void;
}

/** What one leaf of the tree hands its `TerminalView`. */
export interface TerminalPaneLeaf {
  focusRequest: number;
  focused: boolean;
  focusIndicator: boolean;
  onActivate: () => void;
  onExit: () => void;
  onSplit?: (direction: TerminalSplitDirection) => void;
  onNavigateSplit?: (direction: 'previous' | 'next') => void;
  onTitleChange: (title: string) => void;
}

export interface TerminalPaneTree {
  pane: TerminalPane;
  splitFailed: boolean;
  leaf: (sessionId: string) => TerminalPaneLeaf;
}

/**
 * The split, focus and lifetime state of one terminal tab's pane tree.
 *
 * Layout is the caller's: this owns which sessions the tree holds, which one
 * has focus, and when a session is terminated. `terminate` ends every session
 * in the tree on a real unmount, and a StrictMode remount is not one.
 */
export function useTerminalPaneTree({
  attachment,
  session,
  launchSplit,
  onExit,
  onSessionsChange,
  onFocusChange,
  onPaneChange,
  initialPane,
  initialPaneRevision = 0,
  onTitleChange,
}: TerminalPaneTreeOptions): TerminalPaneTree {
  const [paneState, setPaneState] = useState(() => ({
    pane: initialPane ?? { sessionId: attachment.sessionId },
    revision: initialPaneRevision,
  }));
  const pane = paneState.pane;
  const paneRef = useRef(pane);
  const paneRevisionRef = useRef(paneState.revision);
  const callbacks = useRef({ onFocusChange, onPaneChange, onSessionsChange });
  const mountGeneration = useRef(0);
  const [focusedId, setFocusedId] = useState(attachment.sessionId);
  const [focusRequest, setFocusRequest] = useState({ sessionId: '', generation: 0 });
  const splitPending = useRef(false);
  const [splitFailed, setSplitFailed] = useState(false);
  paneRef.current = pane;
  paneRevisionRef.current = paneState.revision;
  callbacks.current = { onFocusChange, onPaneChange, onSessionsChange };

  useEffect(() => {
    if (!initialPane) return;
    setPaneState((current) =>
      initialPaneRevision > current.revision
        ? { pane: initialPane, revision: initialPaneRevision }
        : current,
    );
  }, [initialPane, initialPaneRevision]);

  useEffect(() => {
    const generation = mountGeneration.current + 1;
    mountGeneration.current = generation;
    return () => {
      if (session.disposition !== 'terminate') return;
      const sessionIds = terminalPaneSessionIds(paneRef.current);
      queueMicrotask(() => {
        if (mountGeneration.current !== generation) return;
        for (const sessionId of sessionIds) void session.transport.terminate(sessionId);
      });
    };
  }, [session.disposition, session.transport]);

  useEffect(() => {
    callbacks.current.onSessionsChange?.(attachment.id, terminalPaneSessionIds(pane));
  }, [attachment.id, pane]);

  useEffect(() => {
    callbacks.current.onFocusChange?.(attachment.id, focusedId);
  }, [attachment.id, focusedId]);

  function commitPane(update: (current: TerminalPane) => TerminalPane): void {
    const next = update(paneRef.current);
    const revision = paneRevisionRef.current;
    paneRef.current = next;
    setPaneState({ pane: next, revision });
    callbacks.current.onPaneChange?.(attachment.id, next, revision);
  }

  function requestPaneFocus(sessionId: string): void {
    setFocusedId(sessionId);
    setFocusRequest((current) => ({
      sessionId,
      generation: current.generation + 1,
    }));
  }

  function navigateSplit(fromId: string, direction: 'previous' | 'next'): void {
    const ids = terminalPaneSessionIds(pane);
    if (ids.length < 2) return;
    const index = ids.indexOf(fromId);
    const offset = direction === 'previous' ? -1 : 1;
    requestPaneFocus(ids[(index + offset + ids.length) % ids.length] ?? fromId);
  }

  function exitPane(sessionId: string): void {
    const remaining = removeTerminalPane(paneRef.current, sessionId);
    if (!remaining) {
      onExit?.(attachment.id);
      return;
    }
    const ids = terminalPaneSessionIds(remaining);
    commitPane(() => remaining);
    if (focusedId === sessionId) requestPaneFocus(ids[0]!);
  }

  function split(sessionId: string, direction: TerminalSplitDirection, launch: () => Promise<{ sessionId: string }>): void {
    if (splitPending.current) return;
    splitPending.current = true;
    setSplitFailed(false);
    void launch()
      .then((result) => {
        commitPane((existing) =>
          splitTerminalPane(existing, sessionId, direction, result.sessionId));
        requestPaneFocus(result.sessionId);
      })
      .catch(() => setSplitFailed(true))
      .finally(() => {
        splitPending.current = false;
      });
  }

  const multiple = terminalPaneSessionIds(pane).length > 1;

  return {
    pane,
    splitFailed,
    leaf: (sessionId) => ({
      focusRequest: focusRequest.sessionId === sessionId ? focusRequest.generation : 0,
      focused: focusedId === sessionId,
      focusIndicator: multiple,
      onActivate: () => setFocusedId(sessionId),
      onExit: () => exitPane(sessionId),
      onSplit: launchSplit ? (direction) => split(sessionId, direction, launchSplit) : undefined,
      onNavigateSplit: multiple ? (direction) => navigateSplit(sessionId, direction) : undefined,
      onTitleChange: (title) => {
        if (focusedId === sessionId) onTitleChange?.(attachment.id, title);
      },
    }),
  };
}
