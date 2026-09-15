import { describe, expect, it, vi } from 'vitest';

import {
  createTerminalSessionMetadataStore,
  type TerminalSessionMetadata,
  type TerminalSessionMetadataProvider,
} from '../src/main/native/session-metadata.js';

const metadata: TerminalSessionMetadata = {
  sessionId: 'session-1',
  title: 'Terminal 1',
  frameId: '42',
};

describe('terminal session metadata facade', () => {
  it('uses the no-op provider by default', () => {
    const store = createTerminalSessionMetadataStore();

    store.remember(metadata);

    expect(store.find(metadata.sessionId)).toBeUndefined();
  });

  it('delegates to an injected provider without choosing persistence', () => {
    const provider: TerminalSessionMetadataProvider = {
      read: vi.fn(() => metadata),
      write: vi.fn(),
      remove: vi.fn(),
    };
    const store = createTerminalSessionMetadataStore(provider);

    store.remember(metadata);
    expect(store.find(metadata.sessionId)).toEqual(metadata);
    store.forget(metadata.sessionId);

    expect(provider.write).toHaveBeenCalledWith(metadata);
    expect(provider.read).toHaveBeenCalledWith(metadata.sessionId);
    expect(provider.remove).toHaveBeenCalledWith(metadata.sessionId);
  });
});
