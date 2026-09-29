import {
  TerminalView,
  useTerminalPaneTree,
  type DetachableTerminalTransport,
  type GhosttyWindowAdjustment,
  type TerminalAttachment,
  type TerminalEmulatorKind,
  type TerminalPane,
  type TerminalPaneTreeOptions,
  type TerminalTheme,
  type TerminalTransport,
} from '@maximal/maximal-terminal/renderer';

import { RetainedTabPanels } from './RetainedTabPanels.js';
import { SplitTree } from './SplitTree.js';

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
  onFocusChange?: (tabId: string, sessionId: string) => void;
  onPaneChange?: (tabId: string, pane: TerminalPane, baseRevision: number) => void;
  initialPane?: TerminalPane;
  initialPanes?: ReadonlyMap<string, TerminalPane>;
  paneRevisions?: ReadonlyMap<string, number>;
  paneFocusRequest?: { tabId: string; sessionId: string; generation: number };
  onTitleChange?: (tabId: string, title: string) => void;
}

type TerminalTabsAttachments =
  | { ids: string[]; attachments?: never }
  | { ids?: never; attachments: TerminalAttachment[] };

export type TerminalTabsProps = TerminalTabsCommonProps & TerminalTabsAttachments &
  (
    | { disposition?: 'terminate'; transport: TerminalTransport }
    | { disposition: 'detach'; transport: DetachableTerminalTransport }
  );

interface TerminalAttachmentViewProps extends TerminalPaneTreeOptions {
  emulator?: TerminalEmulatorKind;
  ghosttyWindow?: GhosttyWindowAdjustment;
  shell?: string;
  theme?: TerminalTheme;
}

function TerminalAttachmentView({
  emulator,
  ghosttyWindow,
  shell,
  theme,
  ...options
}: TerminalAttachmentViewProps) {
  const tree = useTerminalPaneTree(options);
  return (
    <>
      <SplitTree<{ sessionId: string }>
        node={tree.pane}
        id={options.attachment.id}
        className="terminal-split"
        panelClassName="terminal-split__panel"
        renderLeaf={({ sessionId }) => (
          <TerminalView
            id={sessionId}
            emulator={emulator}
            ghosttyWindow={ghosttyWindow}
            shell={shell}
            theme={theme}
            disposition="preserve"
            transport={options.session.transport}
            {...tree.leaf(sessionId)}
          />
        )}
      />
      {tree.splitFailed && <p className="terminal-split__error" role="alert">Terminal split could not start.</p>}
    </>
  );
}

/**
 * Every open terminal, with the inactive ones hidden rather than unmounted.
 *
 * That is a scrollback decision rather than a lifetime one. `detach` keeps the
 * shell alive across an unmount, but the scrollback lives in the emulator and
 * dies with it, so a reattached view gets the tail the host retained and
 * nothing older. `disposition` decides what closing does: `terminate` ends the
 * session, `detach` leaves it running for something else to reattach, and only
 * the detachable transport allows it.
 */
export function TerminalTabs(props: TerminalTabsProps) {
  const { activeId, emulator, ghosttyWindow, shell, theme, initialPane, initialPanes, paneRevisions } = props;
  const attachments = props.attachments ?? props.ids.map((id) => ({ id, sessionId: id }));
  const session =
    props.disposition === 'detach'
      ? ({ disposition: 'detach', transport: props.transport } as const)
      : ({ disposition: 'terminate', transport: props.transport } as const);

  return (
    <RetainedTabPanels
      items={attachments}
      activeId={activeId}
      className="terminal-host"
      renderPanel={(attachment) => (
        <TerminalAttachmentView
          attachment={attachment}
          emulator={emulator}
          ghosttyWindow={ghosttyWindow}
          shell={shell}
          theme={theme}
          launchSplit={props.launchSplit}
          onExit={props.onExit}
          onSessionsChange={props.onSessionsChange}
          onFocusChange={props.onFocusChange}
          onPaneChange={props.onPaneChange}
          requestedFocus={props.paneFocusRequest?.tabId === attachment.id
            ? {
                sessionId: props.paneFocusRequest.sessionId,
                generation: props.paneFocusRequest.generation,
              }
            : undefined}
          initialPane={initialPanes?.get(attachment.id) ?? initialPane}
          initialPaneRevision={paneRevisions?.get(attachment.id)}
          onTitleChange={props.onTitleChange}
          session={session}
        />
      )}
    />
  );
}
