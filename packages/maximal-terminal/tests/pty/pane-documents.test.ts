import { describe, expect, it } from 'vitest';

import {
  paneSessionIds,
  PtyPaneDocuments,
  type PaneDocument,
  type PaneSessionOwner,
} from '../../src/pty/pane-documents.js';
import type { TerminalPane } from '../../src/pane.js';

interface FakeWindow {
  id: number;
  destroyed: boolean;
  isDestroyed(): boolean;
}

function fakeWindow(id: number): FakeWindow {
  return { id, destroyed: false, isDestroyed() { return this.destroyed; } };
}

const split: TerminalPane = {
  direction: 'right',
  first: { sessionId: 'a' },
  second: { direction: 'down', first: { sessionId: 'b' }, second: { sessionId: 'c' } },
};

function harness() {
  const viewers = new Map<string, Map<FakeWindow, unknown>>();
  const owners = new Map<string, PaneSessionOwner<FakeWindow>>();
  const log: unknown[][] = [];
  const published: Array<[FakeWindow, string, PaneDocument<FakeWindow>]> = [];
  const documents = new PtyPaneDocuments<FakeWindow>({
    viewers: (id) => viewers.get(id),
    resolveSession: (requestor, sessionId) => {
      log.push(['resolve', requestor.id, sessionId]);
      return owners.get(sessionId);
    },
    setDocument: (id, sessionIds) => log.push(['setDocument', id, sessionIds]),
    share: (owner, viewer, sessionId) => log.push(['share', owner.id, viewer.id, sessionId]),
    publish: (viewer, id, document) => published.push([viewer, id, { ...document, viewers: new Set(document.viewers) }]),
  });
  return { documents, viewers, owners, log, published };
}

describe('paneSessionIds', () => {
  it('lists every leaf in depth-first order', () => {
    expect(paneSessionIds(split)).toEqual(['a', 'b', 'c']);
    expect(paneSessionIds({ sessionId: 'solo' })).toEqual(['solo']);
  });
});

describe('PtyPaneDocuments', () => {
  it('drops a sync for a document nobody views', () => {
    const { documents, viewers, owners, log, published } = harness();
    const requestor = fakeWindow(1);
    owners.set('a', { owner: requestor, projection: false });
    documents.request('a', requestor, { sessionId: 'a' });
    viewers.set('a', new Map());
    documents.request('a', requestor, { sessionId: 'a' });
    viewers.set('a', new Map([[requestor, {}]]));
    documents.flush();
    expect(log).toEqual([]);
    expect(published).toEqual([]);
    expect(documents.get('a')).toBeUndefined();
  });

  it('waits until every named session is live, then publishes once', () => {
    const { documents, viewers, owners, log, published } = harness();
    const requestor = fakeWindow(1);
    const viewer = fakeWindow(2);
    viewers.set('a', new Map([[requestor, {}], [viewer, {}]]));
    owners.set('a', { owner: requestor, projection: false });
    owners.set('c', { owner: viewer, projection: true });

    documents.request('a', requestor, split);
    expect(log).toEqual([['resolve', 1, 'a'], ['resolve', 1, 'b']]);
    expect(published).toEqual([]);
    expect(documents.get('a')).toBeUndefined();

    log.length = 0;
    owners.set('b', { owner: viewer, projection: false });
    documents.flush();
    expect(log).toEqual([
      ['resolve', 1, 'a'],
      ['resolve', 1, 'b'],
      ['resolve', 1, 'c'],
      ['setDocument', 'a', ['a', 'b', 'c']],
      ['share', 1, 2, 'a'],
      ['share', 2, 1, 'b'],
    ]);
    const document = { pane: split, revision: 1, origin: '1', viewers: new Set([requestor, viewer]) };
    expect(published).toEqual([[requestor, 'a', document], [viewer, 'a', document]]);
    expect(documents.get('a')).toEqual(document);

    log.length = 0;
    documents.flush();
    expect(log).toEqual([]);
    expect(published).toHaveLength(2);
  });

  it('advances the revision and skips destroyed viewers', () => {
    const { documents, viewers, owners, published } = harness();
    const first = fakeWindow(1);
    const second = fakeWindow(7);
    viewers.set('a', new Map([[first, {}], [second, {}]]));
    owners.set('a', { owner: first, projection: false });
    documents.request('a', first, { sessionId: 'a' });
    second.destroyed = true;
    documents.request('a', second, { sessionId: 'a' });
    expect(published.map(([viewer, , document]) => [viewer.id, document.revision, document.origin]))
      .toEqual([[1, 1, '1'], [7, 1, '1'], [1, 2, '7']]);
  });

  it('authorizes session viewers and document viewers only', () => {
    const { documents, viewers, owners } = harness();
    const owner = fakeWindow(1);
    const viewer = fakeWindow(2);
    const stranger = fakeWindow(3);
    viewers.set('a', new Map([[owner, {}], [viewer, {}]]));
    owners.set('a', { owner, projection: false });
    owners.set('p', { owner, projection: true });
    documents.request('a', owner, { direction: 'down', first: { sessionId: 'a' }, second: { sessionId: 'p' } });

    expect(documents.isAuthorizedViewer(viewer, 'a')).toBe(true);
    expect(documents.isAuthorizedViewer(viewer, 'p')).toBe(true);
    expect(documents.isAuthorizedViewer(stranger, 'a')).toBe(false);
    expect(documents.isAuthorizedViewer(viewer, 'z')).toBe(false);

    documents.forgetWindow(viewer);
    expect(documents.isAuthorizedViewer(viewer, 'a')).toBe(false);
    expect(documents.isAuthorizedViewer(viewer, 'p')).toBe(false);
    expect(documents.isAuthorizedViewer(owner, 'a')).toBe(true);
    expect(documents.get('a')?.viewers).toEqual(new Set([owner]));
  });

  it('authorizes a session viewer after its document is gone', () => {
    const { documents, viewers, owners } = harness();
    const owner = fakeWindow(1);
    const viewer = fakeWindow(2);
    viewers.set('doc', new Map([[owner, {}], [viewer, {}]]));
    owners.set('a', { owner, projection: false });
    documents.request('doc', owner, { sessionId: 'a' });
    documents.forgetSession('doc');
    expect(documents.get('doc')).toBeUndefined();
    expect(documents.isAuthorizedViewer(viewer, 'a')).toBe(true);
    documents.forgetSession('a');
    expect(documents.isAuthorizedViewer(viewer, 'a')).toBe(false);
  });

  it('forgets a pending sync with its session', () => {
    const { documents, viewers, owners, published } = harness();
    const owner = fakeWindow(1);
    viewers.set('a', new Map([[owner, {}]]));
    documents.request('a', owner, { sessionId: 'a' });
    documents.forgetSession('a');
    owners.set('a', { owner, projection: false });
    documents.flush();
    expect(published).toEqual([]);
  });
});
