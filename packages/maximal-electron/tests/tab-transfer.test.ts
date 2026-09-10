import { describe, expect, it } from 'vitest';

import {
  decodeTabTransfer,
  encodeTabTransfer,
  moveTabBefore,
  TAB_TRANSFER_MIME,
  type TabTransfer,
} from '../src/renderer/lib/tab-transfer.js';

const transfer: TabTransfer = {
  version: 1,
  sourceFrameId: 'main',
  tabId: 'terminal:one',
};

describe('tab transfers', () => {
  it('uses the interoperable shell-tab MIME type', () => {
    expect(TAB_TRANSFER_MIME).toBe('application/x-stuffbucket-shell-tab+json');
  });

  it('round trips the versioned identity payload', () => {
    expect(decodeTabTransfer(encodeTabTransfer(transfer))).toEqual(transfer);
  });

  it('rejects malformed, unsupported, and empty identities', () => {
    expect(decodeTabTransfer('not json')).toBeUndefined();
    expect(decodeTabTransfer('{"version":2,"sourceFrameId":"main","tabId":"one"}')).toBeUndefined();
    expect(decodeTabTransfer('{"version":1,"sourceFrameId":"","tabId":"one"}')).toBeUndefined();
    expect(decodeTabTransfer('{"version":1,"sourceFrameId":"main","tabId":""}')).toBeUndefined();
    expect(decodeTabTransfer('{"version":1,"sourceFrameId":1,"tabId":"one"}')).toBeUndefined();
    expect(decodeTabTransfer('{"version":1,"sourceFrameId":"main","tabId":1}')).toBeUndefined();
  });

  it('moves a tab before another tab', () => {
    expect(moveTabBefore([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'c', 'b'))
      .toEqual([{ id: 'a' }, { id: 'c' }, { id: 'b' }]);
    expect(moveTabBefore([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'b', 'a'))
      .toEqual([{ id: 'b' }, { id: 'a' }, { id: 'c' }]);
  });

  it('moves a tab to the end when no target is given', () => {
    expect(moveTabBefore([{ id: 'a' }, { id: 'b' }, { id: 'c' }], 'a'))
      .toEqual([{ id: 'b' }, { id: 'c' }, { id: 'a' }]);
  });

  it('leaves the order unchanged for absent and self targets', () => {
    const tabs = [{ id: 'a' }, { id: 'b' }];
    expect(moveTabBefore(tabs, 'missing', 'a')).toEqual(tabs);
    expect(moveTabBefore(tabs, 'b', 'missing')).toEqual(tabs);
    expect(moveTabBefore(tabs, 'a', 'a')).toEqual(tabs);
  });
});