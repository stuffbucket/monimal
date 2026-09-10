import { Group, Panel, Separator } from 'react-resizable-panels';
import { useEffect, useRef, useState } from 'react';

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
  removeTerminalPane,
  splitTerminalPane,
  terminalPaneSessionIds,
  type TerminalPane,
} from '../lib/terminal-pane.js';
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
  const [pane, setPane] = useState<TerminalPane>({ sessionId: attachment.sessionId });
  const paneRef = useRef(pane);
  const mountGeneration = useRef(0);
  const [focusedId, setFocusedId] = useState(attachment.sessionId);
  const [focusRequest, setFocusRequest] = useState({ sessionId: '', generation: 0 });
  const splitPending = useRef(false);
  const [splitFailed, setSplitFailed] = useState(false);
  paneRef.current = pane;

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
    onSessionsChange?.(attachment.id, terminalPaneSessionIds(pane));
  }, [attachment.id, onSessionsChange, pane]);

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
    setPane(remaining);
    if (focusedId === sessionId) requestPaneFocus(ids[0]!);
  }

  function renderPane(current: TerminalPane, path: string): React.ReactNode {
    if ('sessionId' in current) {
      const sessionId = current.sessionId;
      return (
        <TerminalView
          id={sessionId}
          emulator={emulator}
          ghosttyWindow={ghosttyWindow}
          shell={shell}
          theme={theme}
          disposition="preserve"
          transport={session.transport}
          focusRequest={focusRequest.sessionId === sessionId ? focusRequest.generation : 0}
          focusIndicator={terminalPaneSessionIds(pane).length > 1}
          onFocus={() => setFocusedId(sessionId)}
          onExit={() => exitPane(sessionId)}
          onSplit={launchSplit ? (direction) => {
            if (splitPending.current) return;
            splitPending.current = true;
            setSplitFailed(false);
            void launchSplit()
              .then((result) => {
                setPane((existing) => splitTerminalPane(existing, sessionId, direction, result.sessionId));
                requestPaneFocus(result.sessionId);
              })
              .catch(() => setSplitFailed(true))
              .finally(() => {
                splitPending.current = false;
              });
          } : undefined}
          onNavigateSplit={terminalPaneSessionIds(pane).length > 1
            ? (direction) => navigateSplit(sessionId, direction)
            : undefined}
          onTitleChange={(title) => {
            if (focusedId === sessionId) onTitleChange?.(attachment.id, title);
          }}
        />
      );
    }

    const orientation = current.direction === 'right' ? 'horizontal' : 'vertical';
    return (
      <Group
        orientation={orientation}
        className="terminal-split"
        defaultLayout={{ [`${path}-first`]: 50, [`${path}-second`]: 50 }}
        resizeTargetMinimumSize={{ coarse: 20, fine: 9 }}
      >
        <Panel className="terminal-split__panel" id={`${path}-first`} minSize="10%">
          {renderPane(current.first, `${path}-first`)}
        </Panel>
        <Separator
          className={orientation === 'vertical'
            ? 'resize-handle resize-handle--horizontal'
            : 'resize-handle'}
        />
        <Panel className="terminal-split__panel" id={`${path}-second`} minSize="10%">
          {renderPane(current.second, `${path}-second`)}
        </Panel>
      </Group>
    );
  }

  return (
    <>
      {renderPane(pane, attachment.id)}
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
