declare const terminalIdBrand: unique symbol;

type TerminalId<Kind extends string> = string & {
  readonly [terminalIdBrand]: Kind;
};

export type TerminalDocumentId = TerminalId<'document'>;
export type TerminalProjectionId = TerminalId<'projection'>;
export type TerminalSessionId = TerminalId<'session'>;
export type TerminalViewId = TerminalId<'view'>;

/** Creates a non-empty terminal document identity. */
export const terminalDocumentId = (value: string): TerminalDocumentId => identity(value);
/** Creates a non-empty backend projection identity. */
export const terminalProjectionId = (value: string): TerminalProjectionId => identity(value);
/** Creates a non-empty process session identity. */
export const terminalSessionId = (value: string): TerminalSessionId => identity(value);
/** Creates a non-empty renderer view identity. */
export const terminalViewId = (value: string): TerminalViewId => identity(value);

export type TerminalSplitDirection = 'right' | 'down';
export type TerminalDockEdge = 'left' | 'right' | 'top' | 'bottom';

export type TerminalPane =
  | { kind: 'leaf'; viewId: TerminalViewId }
  | {
      kind: 'split';
      direction: TerminalSplitDirection;
      first: TerminalPane;
      second: TerminalPane;
    };

export interface TerminalProjectionRecord {
  id: TerminalProjectionId;
  sessionId: TerminalSessionId;
}

export interface TerminalViewRecord {
  id: TerminalViewId;
  sessionId: TerminalSessionId;
  projectionId?: TerminalProjectionId;
}

export interface TerminalDocument {
  id: TerminalDocumentId;
  title: string;
  root: TerminalPane;
  focusedViewId?: TerminalViewId;
}

export interface TerminalWorkspace {
  documents: ReadonlyMap<TerminalDocumentId, TerminalDocument>;
  projections: ReadonlyMap<TerminalProjectionId, TerminalProjectionRecord>;
  views: ReadonlyMap<TerminalViewId, TerminalViewRecord>;
}

export interface TerminalWorkspaceInput {
  documents: readonly TerminalDocument[];
  projections?: readonly TerminalProjectionRecord[];
  views: readonly TerminalViewRecord[];
}

function identity<Id extends string>(value: string): Id {
  if (value.length === 0) throw new Error('Terminal identity must not be empty.');
  return value as Id;
}

function uniqueMap<Id, Value extends { id: Id }>(values: readonly Value[], label: string): Map<Id, Value> {
  const result = new Map(values.map((value) => [value.id, value]));
  if (result.size !== values.length) throw new Error(`Duplicate terminal ${label} identity.`);
  return result;
}

/** Lists renderer view identities in visual pane order. */
export function terminalPaneViewIds(pane: TerminalPane): TerminalViewId[] {
  return pane.kind === 'leaf'
    ? [pane.viewId]
    : [...terminalPaneViewIds(pane.first), ...terminalPaneViewIds(pane.second)];
}

/** Returns every ownership or identity violation in a terminal workspace. */
export function terminalWorkspaceIssues(workspace: TerminalWorkspace): string[] {
  const issues: string[] = [];
  const references = new Map<TerminalViewId, number>();
  const projectionReferences = new Map<TerminalProjectionId, TerminalViewId>();

  for (const document of workspace.documents.values()) {
    const documentViewIds = terminalPaneViewIds(document.root);
    const documentViews = new Set(documentViewIds);
    for (const viewId of documentViewIds) {
      references.set(viewId, (references.get(viewId) ?? 0) + 1);
      if (!workspace.views.has(viewId)) issues.push(`Document ${document.id} references missing view ${viewId}.`);
    }
    if (document.focusedViewId && !documentViews.has(document.focusedViewId)) {
      issues.push(`Document ${document.id} focuses view ${document.focusedViewId} outside its pane tree.`);
    }
  }

  for (const view of workspace.views.values()) {
    const count = references.get(view.id) ?? 0;
    if (count === 0) issues.push(`View ${view.id} is not owned by a document.`);
    if (count > 1) issues.push(`View ${view.id} is owned by more than one pane leaf.`);
    if (!view.projectionId) continue;
    const existingViewId = projectionReferences.get(view.projectionId);
    if (existingViewId) {
      issues.push(`Projection ${view.projectionId} is shared by views ${existingViewId} and ${view.id}.`);
    } else projectionReferences.set(view.projectionId, view.id);
    const projection = workspace.projections.get(view.projectionId);
    if (!projection) issues.push(`View ${view.id} references missing projection ${view.projectionId}.`);
    else if (projection.sessionId !== view.sessionId) {
      issues.push(`View ${view.id} and projection ${projection.id} reference different sessions.`);
    }
  }

  return issues;
}

/** Creates a validated terminal workspace from serializable records. */
export function createTerminalWorkspace(input: TerminalWorkspaceInput): TerminalWorkspace {
  const workspace: TerminalWorkspace = {
    documents: uniqueMap(input.documents, 'document'),
    projections: uniqueMap(input.projections ?? [], 'projection'),
    views: uniqueMap(input.views, 'view'),
  };
  assertTerminalWorkspace(workspace);
  return workspace;
}

/** Throws when a terminal workspace violates an ownership invariant. */
export function assertTerminalWorkspace(workspace: TerminalWorkspace): void {
  const issues = terminalWorkspaceIssues(workspace);
  if (issues.length > 0) throw new Error(issues.join('\n'));
}

function replaceLeaf(
  pane: TerminalPane,
  targetId: TerminalViewId,
  replacement: TerminalPane,
): TerminalPane {
  if (pane.kind === 'leaf') return pane.viewId === targetId ? replacement : pane;
  return {
    ...pane,
    first: replaceLeaf(pane.first, targetId, replacement),
    second: replaceLeaf(pane.second, targetId, replacement),
  };
}

function removeLeaf(pane: TerminalPane, targetId: TerminalViewId): TerminalPane | undefined {
  if (pane.kind === 'leaf') return pane.viewId === targetId ? undefined : pane;
  const first = removeLeaf(pane.first, targetId);
  const second = removeLeaf(pane.second, targetId);
  if (!first) return second;
  if (!second) return first;
  return { ...pane, first, second };
}

/** Adds an independent view beside one pane leaf and focuses the new view. */
export function splitTerminalView(
  workspace: TerminalWorkspace,
  documentId: TerminalDocumentId,
  targetViewId: TerminalViewId,
  direction: TerminalSplitDirection,
  view: TerminalViewRecord,
): TerminalWorkspace {
  if (workspace.views.has(view.id)) throw new Error(`Terminal view ${view.id} already exists.`);
  const document = workspace.documents.get(documentId);
  if (!document) throw new Error(`Terminal document ${documentId} does not exist.`);
  if (!terminalPaneViewIds(document.root).includes(targetViewId)) {
    throw new Error(`Terminal view ${targetViewId} does not belong to document ${documentId}.`);
  }
  const root = replaceLeaf(document.root, targetViewId, {
    kind: 'split',
    direction,
    first: { kind: 'leaf', viewId: targetViewId },
    second: { kind: 'leaf', viewId: view.id },
  });
  return {
    ...workspace,
    documents: new Map(workspace.documents).set(documentId, { ...document, root, focusedViewId: view.id }),
    views: new Map(workspace.views).set(view.id, view),
  };
}

/** Changes logical focus within one terminal document. */
export function focusTerminalView(
  workspace: TerminalWorkspace,
  documentId: TerminalDocumentId,
  viewId: TerminalViewId,
): TerminalWorkspace {
  const document = workspace.documents.get(documentId);
  if (!document || !terminalPaneViewIds(document.root).includes(viewId)) {
    throw new Error(`Terminal view ${viewId} does not belong to document ${documentId}.`);
  }
  return {
    ...workspace,
    documents: new Map(workspace.documents).set(documentId, { ...document, focusedViewId: viewId }),
  };
}

/** Removes one view, collapsing its pane branch and empty document. */
export function closeTerminalView(
  workspace: TerminalWorkspace,
  documentId: TerminalDocumentId,
  viewId: TerminalViewId,
): TerminalWorkspace {
  const document = workspace.documents.get(documentId);
  if (!document) throw new Error(`Terminal document ${documentId} does not exist.`);
  if (!terminalPaneViewIds(document.root).includes(viewId)) {
    throw new Error(`Terminal view ${viewId} does not belong to document ${documentId}.`);
  }
  const root = removeLeaf(document.root, viewId);
  const documents = new Map(workspace.documents);
  if (!root) documents.delete(documentId);
  else {
    const remaining = terminalPaneViewIds(root);
    const focusedViewId = document.focusedViewId === viewId ? remaining[0] : document.focusedViewId;
    documents.set(documentId, { ...document, root, focusedViewId });
  }
  const views = new Map(workspace.views);
  views.delete(viewId);
  return { ...workspace, documents, views };
}

/** Moves a source document tree into one edge of a target document. */
export function dockTerminalDocument(
  workspace: TerminalWorkspace,
  sourceId: TerminalDocumentId,
  targetId: TerminalDocumentId,
  edge: TerminalDockEdge,
): TerminalWorkspace {
  if (sourceId === targetId) throw new Error('A terminal document cannot dock into itself.');
  const source = workspace.documents.get(sourceId);
  const target = workspace.documents.get(targetId);
  if (!source || !target) throw new Error('Both terminal documents must exist before docking.');
  const sourceFirst = edge === 'left' || edge === 'top';
  const root: TerminalPane = {
    kind: 'split',
    direction: edge === 'left' || edge === 'right' ? 'right' : 'down',
    first: sourceFirst ? source.root : target.root,
    second: sourceFirst ? target.root : source.root,
  };
  const documents = new Map(workspace.documents);
  documents.delete(sourceId);
  documents.set(targetId, {
    ...target,
    root,
    focusedViewId: source.focusedViewId ?? target.focusedViewId,
  });
  return { ...workspace, documents };
}