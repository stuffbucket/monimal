import { describe, expect, it } from 'vitest';

import {
  closeTerminalView,
  createTerminalWorkspace,
  dockTerminalDocument,
  focusTerminalView,
  assertTerminalWorkspace,
  splitTerminalView,
  terminalDocumentId,
  terminalPaneViewIds,
  terminalProjectionId,
  terminalSessionId,
  terminalViewId,
  terminalWorkspaceIssues,
  type TerminalDocument,
  type TerminalDockEdge,
  type TerminalPane,
  type TerminalViewRecord,
  type TerminalWorkspace,
} from '../../src/renderer/lib/terminal-workspace.js';

const sessionId = terminalSessionId('session-a');
const projectionId = terminalProjectionId('projection-a');

function view(name: string): TerminalViewRecord {
  return { id: terminalViewId(name), sessionId, projectionId };
}

function localView(name: string): TerminalViewRecord {
  return { id: terminalViewId(name), sessionId };
}

function document(name: string, terminalView: TerminalViewRecord): TerminalDocument {
  return {
    id: terminalDocumentId(name),
    title: name,
    root: { kind: 'leaf', viewId: terminalView.id },
    focusedViewId: terminalView.id,
  };
}

function singleDocumentWorkspace(): TerminalWorkspace {
  const terminalView = view('view-a');
  return createTerminalWorkspace({
    documents: [document('document-a', terminalView)],
    projections: [{ id: projectionId, sessionId }],
    views: [terminalView],
  });
}

describe('terminal workspace', () => {
  it.each([3, 4, 8, 16])('allows %i independent views of one session', (count) => {
    const views = Array.from({ length: count }, (_, index) => localView(`view-${String(index + 1)}`));
    let workspace = createTerminalWorkspace({
      documents: [document('document-a', views[0]!)],
      views: [views[0]!],
    });

    for (const terminalView of views.slice(1)) {
      workspace = splitTerminalView(
        workspace,
        terminalDocumentId('document-a'),
        views[0]!.id,
        'right',
        terminalView,
      );
    }

    expect(workspace.views).toHaveLength(count);
    expect([...workspace.views.values()].every((entry) => entry.sessionId === sessionId)).toBe(true);
    expect(workspace.documents.get(terminalDocumentId('document-a'))?.root.kind).toBe('split');
    expect(terminalWorkspaceIssues(workspace)).toEqual([]);
  });

  it('docks a complete document, then closes one view without affecting its session peers', () => {
    const views = ['view-a', 'view-b', 'view-c', 'view-d'].map(localView);
    let workspace = createTerminalWorkspace({
      documents: [document('source', views[0]!), document('target', views[3]!)],
      views: [views[0]!, views[3]!],
    });
    workspace = splitTerminalView(workspace, terminalDocumentId('source'), views[0]!.id, 'right', views[1]!);
    workspace = splitTerminalView(workspace, terminalDocumentId('source'), views[1]!.id, 'down', views[2]!);
    workspace = dockTerminalDocument(
      workspace,
      terminalDocumentId('source'),
      terminalDocumentId('target'),
      'left',
    );
    workspace = closeTerminalView(workspace, terminalDocumentId('target'), views[1]!.id);

    expect(workspace.documents.has(terminalDocumentId('source'))).toBe(false);
    expect([...workspace.views.keys()]).toEqual([views[0]!.id, views[3]!.id, views[2]!.id]);
    const target = workspace.documents.get(terminalDocumentId('target'))!;
    expect(terminalPaneViewIds(target.root))
      .toEqual([views[0]!.id, views[2]!.id, views[3]!.id]);
    expect(target.focusedViewId).toBe(views[2]!.id);
    expect(terminalWorkspaceIssues(workspace)).toEqual([]);
  });

  it('rejects closing a view outside the selected document', () => {
    const first = view('view-a');
    const second = view('view-b');
    let workspace = createTerminalWorkspace({
      documents: [document('document-a', first)],
      projections: [{ id: projectionId, sessionId }],
      views: [first],
    });
    workspace = splitTerminalView(workspace, terminalDocumentId('document-a'), first.id, 'right', second);

    expect(() => closeTerminalView(
      workspace,
      terminalDocumentId('document-a'),
      terminalViewId('missing'),
    )).toThrow('does not belong');
  });

  it('moves logical focus only within the owning document', () => {
    const first = view('view-a');
    const second = view('view-b');
    let workspace = createTerminalWorkspace({
      documents: [document('document-a', first)],
      projections: [{ id: projectionId, sessionId }],
      views: [first],
    });
    workspace = splitTerminalView(workspace, terminalDocumentId('document-a'), first.id, 'down', second);
    workspace = focusTerminalView(workspace, terminalDocumentId('document-a'), first.id);

    expect(workspace.documents.get(terminalDocumentId('document-a'))?.focusedViewId).toBe(first.id);
    expect(() => focusTerminalView(workspace, terminalDocumentId('document-a'), terminalViewId('missing')))
      .toThrow('does not belong');
  });

  it('removes a final view and its document without removing its projection', () => {
    const workspace = closeTerminalView(
      singleDocumentWorkspace(),
      terminalDocumentId('document-a'),
      terminalViewId('view-a'),
    );

    expect(workspace.documents).toHaveLength(0);
    expect(workspace.views).toHaveLength(0);
    expect(workspace.projections).toHaveLength(1);
  });

  it('moves focus to the first remaining view when the focused view closes', () => {
    const first = view('view-a');
    const second = view('view-b');
    let workspace = splitTerminalView(
      singleDocumentWorkspace(),
      terminalDocumentId('document-a'),
      first.id,
      'right',
      second,
    );
    workspace = closeTerminalView(workspace, terminalDocumentId('document-a'), second.id);

    expect(workspace.documents.get(terminalDocumentId('document-a'))?.focusedViewId).toBe(first.id);
  });

  it.each<{
    edge: TerminalDockEdge;
    direction: 'right' | 'down';
    order: readonly string[];
  }>([
    { edge: 'left', direction: 'right', order: ['source-view', 'target-view'] },
    { edge: 'right', direction: 'right', order: ['target-view', 'source-view'] },
    { edge: 'top', direction: 'down', order: ['source-view', 'target-view'] },
    { edge: 'bottom', direction: 'down', order: ['target-view', 'source-view'] },
  ])('docks a document at the $edge edge', ({ edge, direction, order }) => {
    const sourceView = localView('source-view');
    const targetView = localView('target-view');
    const source = { ...document('source', sourceView), focusedViewId: undefined };
    const workspace = dockTerminalDocument(
      createTerminalWorkspace({
        documents: [source, document('target', targetView)],
        views: [sourceView, targetView],
      }),
      source.id,
      terminalDocumentId('target'),
      edge,
    );
    const target = workspace.documents.get(terminalDocumentId('target'))!;

    expect(target.root.kind).toBe('split');
    expect(target.root.kind === 'split' ? target.root.direction : undefined).toBe(direction);
    expect(terminalPaneViewIds(target.root)).toEqual(order.map(terminalViewId));
    expect(target.focusedViewId).toBe(targetView.id);
  });

  it('rejects invalid split, focus, close, and dock targets', () => {
    const workspace = singleDocumentWorkspace();
    const newView = view('view-b');
    const documentId = terminalDocumentId('document-a');

    expect(() => splitTerminalView(workspace, documentId, terminalViewId('view-a'), 'right', view('view-a')))
      .toThrow('Terminal view view-a already exists.');
    expect(() => splitTerminalView(workspace, terminalDocumentId('missing'), terminalViewId('view-a'), 'right', newView))
      .toThrow('Terminal document missing does not exist.');
    expect(() => splitTerminalView(workspace, documentId, terminalViewId('missing'), 'right', newView))
      .toThrow('Terminal view missing does not belong to document document-a.');
    expect(() => focusTerminalView(workspace, terminalDocumentId('missing'), terminalViewId('view-a')))
      .toThrow('Terminal view view-a does not belong to document missing.');
    expect(() => closeTerminalView(workspace, terminalDocumentId('missing'), terminalViewId('view-a')))
      .toThrow('Terminal document missing does not exist.');
    expect(() => dockTerminalDocument(workspace, documentId, documentId, 'right'))
      .toThrow('A terminal document cannot dock into itself.');
    expect(() => dockTerminalDocument(workspace, terminalDocumentId('missing'), documentId, 'right'))
      .toThrow('Both terminal documents must exist before docking.');
    expect(() => dockTerminalDocument(workspace, documentId, terminalDocumentId('missing'), 'right'))
      .toThrow('Both terminal documents must exist before docking.');
  });

  it('rejects empty and duplicate identities', () => {
    expect(() => terminalViewId('')).toThrow('Terminal identity must not be empty.');
    const terminalView = view('view-a');
    const terminalDocument = document('document-a', terminalView);
    const projection = { id: projectionId, sessionId };

    expect(() => createTerminalWorkspace({
      documents: [terminalDocument, terminalDocument],
      views: [terminalView],
    })).toThrow('Duplicate terminal document identity.');
    expect(() => createTerminalWorkspace({
      documents: [terminalDocument],
      projections: [projection, projection],
      views: [terminalView],
    })).toThrow('Duplicate terminal projection identity.');
    expect(() => createTerminalWorkspace({
      documents: [terminalDocument],
      views: [terminalView, terminalView],
    })).toThrow('Duplicate terminal view identity.');
  });

  it('rejects views whose optional projection belongs to another session', () => {
    const terminalView = view('view-a');
    expect(() => createTerminalWorkspace({
      documents: [document('document-a', terminalView)],
      projections: [{ id: projectionId, sessionId: terminalSessionId('session-b') }],
      views: [terminalView],
    })).toThrow('View view-a and projection projection-a reference different sessions.');
  });

  it('allows a view without a backend projection', () => {
    const terminalView = localView('view-a');
    expect(createTerminalWorkspace({
      documents: [document('document-a', terminalView)],
      views: [terminalView],
    }).projections).toHaveLength(0);
  });

  it('allows many independently projected views of one session', () => {
    const views = ['a', 'b', 'c', 'd'].map((suffix) => ({
      id: terminalViewId(`view-${suffix}`),
      sessionId,
      projectionId: terminalProjectionId(`projection-${suffix}`),
    }));
    let workspace = createTerminalWorkspace({
      documents: [document('document-a', views[0]!)],
      projections: views.map((entry) => ({ id: entry.projectionId, sessionId })),
      views: [views[0]!],
    });
    for (const terminalView of views.slice(1)) {
      workspace = splitTerminalView(
        workspace,
        terminalDocumentId('document-a'),
        views[0]!.id,
        'right',
        terminalView,
      );
    }

    expect(workspace.views).toHaveLength(4);
    expect(workspace.projections).toHaveLength(4);
    expect(terminalWorkspaceIssues(workspace)).toEqual([]);
  });

  it('rejects sharing one backend projection between live views', () => {
    const first = view('view-a');
    const second = view('view-b');
    expect(() => createTerminalWorkspace({
      documents: [document('document-a', first), document('document-b', second)],
      projections: [{ id: projectionId, sessionId }],
      views: [first, second],
    })).toThrow('Projection projection-a is shared by views view-a and view-b.');
  });

  it('reports missing views, invalid focus, and missing projections exactly', () => {
    const missingViewId = terminalViewId('missing-view');
    const orphan = { id: terminalViewId('orphan'), sessionId };
    const missingProjectionView = {
      id: terminalViewId('missing-projection-view'),
      sessionId,
      projectionId: terminalProjectionId('missing-projection'),
    };
    const root: TerminalPane = { kind: 'leaf', viewId: missingViewId };
    const workspace: TerminalWorkspace = {
      documents: new Map([[
        terminalDocumentId('document-a'),
        {
          id: terminalDocumentId('document-a'),
          title: 'document-a',
          root,
          focusedViewId: terminalViewId('outside'),
        },
      ]]),
      projections: new Map(),
      views: new Map([
        [orphan.id, orphan],
        [missingProjectionView.id, missingProjectionView],
      ]),
    };

    expect(terminalWorkspaceIssues(workspace)).toEqual([
      'Document document-a references missing view missing-view.',
      'Document document-a focuses view outside outside its pane tree.',
      'View orphan is not owned by a document.',
      'View missing-projection-view is not owned by a document.',
      'View missing-projection-view references missing projection missing-projection.',
    ]);
    expect(() => assertTerminalWorkspace(workspace)).toThrow([
      'Document document-a references missing view missing-view.',
      'Document document-a focuses view outside outside its pane tree.',
      'View orphan is not owned by a document.',
      'View missing-projection-view is not owned by a document.',
      'View missing-projection-view references missing projection missing-projection.',
    ].join('\n'));
  });

  it('rejects orphaned and multiply-owned views', () => {
    const shared = view('view-a');
    const orphan = view('view-b');
    expect(() => createTerminalWorkspace({
      documents: [document('document-a', shared), document('document-b', shared)],
      projections: [{ id: projectionId, sessionId }],
      views: [shared, orphan],
    })).toThrow(/more than one pane leaf[\s\S]*not owned by a document/);
  });
});