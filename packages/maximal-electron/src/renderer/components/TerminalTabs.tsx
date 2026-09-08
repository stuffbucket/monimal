import type { ITheme } from 'ghostty-web';
import { Group, Panel, Separator } from 'react-resizable-panels';
import { useEffect, useRef, useState } from 'react';

import type {
  DetachableTerminalTransport,
  TerminalTransport,
} from '../lib/terminal-transport.js';
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
  /** Overrides the login shell. A capture fixture passes an impersonal one. */
  shell?: string;
  theme?: ITheme;
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

type TerminalPane =
  | { sessionId: string }
  | {
      direction: 'right' | 'down';
      first: TerminalPane;
      second: TerminalPane;
    };

function splitPane(
  pane: TerminalPane,
  targetId: string,
  direction: 'right' | 'down',
  sessionId: string,
): TerminalPane {
  if ('sessionId' in pane) {
    return pane.sessionId === targetId
      ? { direction, first: pane, second: { sessionId } }
      : pane;
  }
  return {
    ...pane,
    first: splitPane(pane.first, targetId, direction, sessionId),
    second: splitPane(pane.second, targetId, direction, sessionId),
  };
}

function paneSessionIds(pane: TerminalPane): string[] {
  return 'sessionId' in pane
    ? [pane.sessionId]
    : [...paneSessionIds(pane.first), ...paneSessionIds(pane.second)];
}

function removePane(pane: TerminalPane, sessionId: string): TerminalPane | undefined {
  if ('sessionId' in pane) return pane.sessionId === sessionId ? undefined : pane;
  const first = removePane(pane.first, sessionId);
  const second = removePane(pane.second, sessionId);
  if (!first) return second;
  if (!second) return first;
  return { ...pane, first, second };
}

interface TerminalAttachmentViewProps {
  attachment: TerminalAttachment;
  shell?: string;
  theme?: ITheme;
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
  const [focusedId, setFocusedId] = useState(attachment.sessionId);
  const splitPending = useRef(false);
  const [splitFailed, setSplitFailed] = useState(false);
  paneRef.current = pane;

  useEffect(() => () => {
    if (session.disposition !== 'terminate') return;
    for (const sessionId of paneSessionIds(paneRef.current)) {
      void session.transport.terminate(sessionId);
    }
  }, [session.disposition, session.transport]);

  useEffect(() => {
    onSessionsChange?.(attachment.id, paneSessionIds(pane));
  }, [attachment.id, onSessionsChange, pane]);

  function navigateSplit(fromId: string, direction: 'previous' | 'next'): void {
    const ids = paneSessionIds(pane);
    if (ids.length < 2) return;
    const index = ids.indexOf(fromId);
    const offset = direction === 'previous' ? -1 : 1;
    setFocusedId(ids[(index + offset + ids.length) % ids.length] ?? fromId);
  }

  function exitPane(sessionId: string): void {
    const remaining = removePane(paneRef.current, sessionId);
    if (!remaining) {
      onExit?.(attachment.id);
      return;
    }
    const ids = paneSessionIds(remaining);
    setPane(remaining);
    if (focusedId === sessionId) setFocusedId(ids[0]!);
  }

  function renderPane(current: TerminalPane, path: string): React.ReactNode {
    if ('sessionId' in current) {
      const sessionId = current.sessionId;
      return (
        <TerminalView
          id={sessionId}
          shell={shell}
          theme={theme}
          disposition="preserve"
          transport={session.transport}
          focused={focusedId === sessionId}
          onFocus={() => setFocusedId(sessionId)}
          onExit={() => exitPane(sessionId)}
          onSplit={launchSplit ? (direction) => {
            if (splitPending.current) return;
            splitPending.current = true;
            setSplitFailed(false);
            void launchSplit()
              .then((result) => {
                setPane((existing) => splitPane(existing, sessionId, direction, result.sessionId));
                setFocusedId(result.sessionId);
              })
              .catch(() => setSplitFailed(true))
              .finally(() => {
                splitPending.current = false;
              });
          } : undefined}
          onNavigateSplit={paneSessionIds(pane).length > 1
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
