import { createElement, type ReactElement } from 'react';
import { Group, Panel, Separator } from 'react-resizable-panels';

import type {
  TerminalPane,
  TerminalSessionId,
  TerminalViewId,
} from './terminal-workspace.js';

interface TerminalWorkspaceLayoutProps {
  pane: TerminalPane;
  path: string;
  portalNode: (viewId: TerminalViewId) => HTMLDivElement | undefined;
  sessionId: (viewId: TerminalViewId) => TerminalSessionId;
}

export function TerminalWorkspaceLayout({
  pane,
  path,
  portalNode,
  sessionId,
}: TerminalWorkspaceLayoutProps): ReactElement {
  if (pane.kind === 'leaf') {
    const node = portalNode(pane.viewId);
    return createElement('div', {
      className: 'terminal-pane-slot',
      'data-session-id': node ? undefined : sessionId(pane.viewId),
      'data-view-id': node ? undefined : pane.viewId,
      ref: (slot: HTMLDivElement | null) => {
        if (slot && node && node.parentElement !== slot) slot.append(node);
      },
    });
  }

  const orientation = pane.direction === 'right' ? 'horizontal' : 'vertical';
  return createElement(
    Group,
    {
      orientation,
      className: 'terminal-split',
      defaultLayout: { [`${path}-first`]: 50, [`${path}-second`]: 50 },
      resizeTargetMinimumSize: { coarse: 20, fine: 9 },
    },
    createElement(
      Panel,
      { className: 'terminal-split__panel', id: `${path}-first`, minSize: '10%' },
      createElement(TerminalWorkspaceLayout, {
        pane: pane.first,
        path: `${path}-first`,
        portalNode,
        sessionId,
      }),
    ),
    createElement(Separator, {
      className: orientation === 'vertical'
        ? 'resize-handle resize-handle--horizontal'
        : 'resize-handle',
    }),
    createElement(
      Panel,
      { className: 'terminal-split__panel', id: `${path}-second`, minSize: '10%' },
      createElement(TerminalWorkspaceLayout, {
        pane: pane.second,
        path: `${path}-second`,
        portalNode,
        sessionId,
      }),
    ),
  );
}