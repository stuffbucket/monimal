import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

import type {
  GhosttyWindowAdjustment,
  TerminalEmulatorKind,
  TerminalTheme,
} from '../lib/terminal-emulator.js';
import type {
  DetachableTerminalTransport,
  TerminalTransport,
} from '../lib/terminal-transport.js';
import {
  closeTerminalView,
  createTerminalWorkspace,
  focusTerminalView,
  splitTerminalView,
  terminalDocumentId,
  terminalPaneViewIds,
  terminalSessionId,
  terminalViewId,
  type TerminalViewId,
} from '../lib/terminal-workspace.js';
import { TerminalWorkspaceLayout } from '../lib/terminal-workspace-layout.js';
import { TerminalView } from './TerminalView.js';

/**
 * Every open terminal, with the inactive ones hidden.
 *
 * Hidden rather than unmounted, and that is a scrollback decision rather than a
 * lifetime one. `disposition="detach"` keeps the shell alive across an unmount,
 * but the scrollback lives in the emulator and dies with it, so a reattached
 * view gets the tail the host retained and nothing older. An inactive tab stays
 * mounted to keep all of it; detach covers the tab a user actually closes.
 */
interface TerminalTabsCommonProps {
  activeId: string;
  emulator?: TerminalEmulatorKind;
  ghosttyWindow?: GhosttyWindowAdjustment;
  /** Overrides the login shell. A capture fixture passes an impersonal one. */
  shell?: string;
  theme?: TerminalTheme;
  launchSplit?: () => Promise<{ sessionId: string }>;
  onExit?: (tabId: string) => void;
  onSessionsChange?: (tabId: string, sessionIds: string[]) => void;
  onTitleChange?: (tabId: string, title: string) => void;
}

/** A renderer tab attached to one opaque terminal session. */
export interface TerminalAttachment {
  id: string;
  sessionId: string;
}

type TerminalTabsAttachments =
  | { ids: string[]; attachments?: never }
  | { ids?: never; attachments: TerminalAttachment[] };

export type TerminalTabsProps = TerminalTabsCommonProps & TerminalTabsAttachments &
  (
    | { disposition?: 'terminate'; transport: TerminalTransport }
    | { disposition: 'detach'; transport: DetachableTerminalTransport }
  );

interface TerminalAttachmentViewProps {
  attachment: TerminalAttachment;
  emulator?: TerminalEmulatorKind;
  ghosttyWindow?: GhosttyWindowAdjustment;
  shell?: string;
  theme?: TerminalTheme;
  launchSplit?: () => Promise<{ sessionId: string }>;
  onExit?: (tabId: string) => void;
  onSessionsChange?: (tabId: string, sessionIds: string[]) => void;
  onTitleChange?: (tabId: string, title: string) => void;
  session:
    | { disposition: 'terminate'; transport: TerminalTransport }
    | { disposition: 'detach'; transport: DetachableTerminalTransport };
}

function TerminalAttachmentView({
  attachment,
  emulator,
  ghosttyWindow,
  shell,
  theme,
  launchSplit,
  onExit,
  onSessionsChange,
  onTitleChange,
  session,
}: TerminalAttachmentViewProps) {
  const documentId = terminalDocumentId(attachment.id);
  const initialViewId = terminalViewId(`${attachment.id}:view:0`);
  const [workspace, setWorkspace] = useState(() => createTerminalWorkspace({
    documents: [{
      id: documentId,
      title: attachment.id,
      root: { kind: 'leaf', viewId: initialViewId },
      focusedViewId: initialViewId,
    }],
    views: [{
      id: initialViewId,
      sessionId: terminalSessionId(attachment.sessionId),
    }],
  }));
  const workspaceRef = useRef(workspace);
  const mountGeneration = useRef(0);
  const nextView = useRef(1);
  const portalNodes = useRef(new Map<TerminalViewId, HTMLDivElement>());
  const [portalsReady, setPortalsReady] = useState(false);
  const [focusRequest, setFocusRequest] = useState<TerminalViewId>();
  const focusGeneration = useRef(0);
  const splitPending = useRef(false);
  const [splitFailed, setSplitFailed] = useState(false);
  workspaceRef.current = workspace;
  const document = workspace.documents.get(documentId)!;

  function sessionId(viewId: TerminalViewId) {
    return workspace.views.get(viewId)!.sessionId;
  }

  function portalNode(viewId: TerminalViewId): HTMLDivElement | undefined {
    if (!portalsReady) return undefined;
    let node = portalNodes.current.get(viewId);
    if (!node) {
      node = globalThis.document.createElement('div');
      node.className = 'terminal-pane-portal';
      portalNodes.current.set(viewId, node);
    }
    return node;
  }

  useEffect(() => {
    setPortalsReady(true);
    const generation = mountGeneration.current + 1;
    mountGeneration.current = generation;
    return () => {
      if (session.disposition !== 'terminate') return;
      const current = workspaceRef.current;
      const sessionIds = new Set([...current.views.values()].map((view) => view.sessionId));
      queueMicrotask(() => {
        if (mountGeneration.current !== generation) return;
        for (const sessionId of sessionIds) void session.transport.terminate(sessionId);
      });
    };
  }, [session.disposition, session.transport]);

  useEffect(() => {
    onSessionsChange?.(
      attachment.id,
      terminalPaneViewIds(document.root).map((viewId) => workspace.views.get(viewId)!.sessionId),
    );
  }, [attachment.id, document.root, onSessionsChange, workspace.views]);

  function requestPaneFocus(viewId: TerminalViewId): void {
    setWorkspace((current) => focusTerminalView(current, documentId, viewId));
    focusGeneration.current += 1;
    setFocusRequest(viewId);
  }

  function navigateSplit(fromId: TerminalViewId, direction: 'previous' | 'next'): void {
    const viewIds = terminalPaneViewIds(document.root);
    if (viewIds.length < 2) return;
    const index = viewIds.indexOf(fromId);
    const offset = direction === 'previous' ? -1 : 1;
    requestPaneFocus(viewIds[(index + offset + viewIds.length) % viewIds.length] ?? fromId);
  }

  function exitPane(viewId: TerminalViewId): void {
    const current = workspaceRef.current;
    const next = closeTerminalView(current, documentId, viewId);
    if (!next.documents.has(documentId)) {
      onExit?.(attachment.id);
      return;
    }
    setWorkspace(next);
    if (current.documents.get(documentId)?.focusedViewId === viewId) {
      focusGeneration.current += 1;
      setFocusRequest(next.documents.get(documentId)?.focusedViewId);
    }
  }

  function renderTerminal(viewId: TerminalViewId) {
    const view = workspace.views.get(viewId)!;
    const node = portalNode(viewId);
    if (!node) return null;
    const viewIds = terminalPaneViewIds(document.root);
    return createPortal(
        <TerminalView
          id={view.sessionId}
          viewId={viewId}
          emulator={emulator}
          ghosttyWindow={ghosttyWindow}
          shell={shell}
          theme={theme}
          disposition="preserve"
          transport={session.transport}
          focusRequest={focusRequest === viewId ? focusGeneration.current : 0}
          focusIndicator={viewIds.length > 1}
          focusOwner={document.focusedViewId === viewId}
          onFocus={() => setWorkspace((current) => focusTerminalView(current, documentId, viewId))}
          onExit={() => exitPane(viewId)}
          onSplit={launchSplit ? (direction) => {
            if (splitPending.current) return;
            splitPending.current = true;
            setSplitFailed(false);
            void launchSplit()
              .then((result) => {
                const splitViewId = terminalViewId(`${attachment.id}:view:${String(nextView.current)}`);
                nextView.current += 1;
                setWorkspace((current) => splitTerminalView(
                  current,
                  documentId,
                  viewId,
                  direction,
                  { id: splitViewId, sessionId: terminalSessionId(result.sessionId) },
                ));
                focusGeneration.current += 1;
                setFocusRequest(splitViewId);
              })
              .catch(() => setSplitFailed(true))
              .finally(() => {
                splitPending.current = false;
              });
          } : undefined}
          onNavigateSplit={viewIds.length > 1
            ? (direction) => navigateSplit(viewId, direction)
            : undefined}
          onTitleChange={(title) => {
            if (document.focusedViewId === viewId) onTitleChange?.(attachment.id, title);
          }}
        />,
        node,
        viewId,
    );
  }

  return (
    <>
      <TerminalWorkspaceLayout
        pane={document.root}
        path={attachment.id}
        portalNode={portalNode}
        sessionId={sessionId}
      />
      {portalsReady && terminalPaneViewIds(document.root).map(renderTerminal)}
      {splitFailed && <p className="terminal-split__error" role="alert">Terminal split could not start.</p>}
    </>
  );
}

/**
 * One mounted terminal per id, with the inactive ones hidden rather than
 * unmounted.
 *
 * Unmounting would kill the emulator and lose the scrollback, so a tab a user
 * comes back to still holds what it printed. `disposition` decides what
 * closing does: `terminate` ends the session, `detach` leaves it running for
 * something else to reattach, and only the detachable transport allows it.
 */
export function TerminalTabs(props: TerminalTabsProps) {
  const {
    activeId,
    emulator,
    ghosttyWindow,
    shell,
    theme,
    launchSplit,
    onExit,
    onSessionsChange,
    onTitleChange,
  } = props;
  const attachments = props.attachments ?? props.ids.map((id) => ({ id, sessionId: id }));
  const session =
    props.disposition === 'detach'
      ? ({ disposition: 'detach', transport: props.transport } as const)
      : ({ disposition: 'terminate', transport: props.transport } as const);

  return (
    <>
      {attachments.map((attachment) => (
        <div key={attachment.id} className="terminal-host" hidden={attachment.id !== activeId}>
          <TerminalAttachmentView
            attachment={attachment}
            emulator={emulator}
            ghosttyWindow={ghosttyWindow}
            shell={shell}
            theme={theme}
            launchSplit={launchSplit}
            onExit={onExit}
            onSessionsChange={onSessionsChange}
            onTitleChange={onTitleChange}
            session={session}
          />
        </div>
      ))}
    </>
  );
}
