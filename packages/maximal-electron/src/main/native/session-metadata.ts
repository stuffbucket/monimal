import type { Rectangle } from 'electron';

/** Metadata that may later be restored for a detached terminal session. */
export interface TerminalSessionMetadata {
  sessionId: string;
  title: string;
  frameId: string;
  bounds?: Rectangle;
}

/**
 * Persistence is deliberately outside the terminal implementation.
 *
 * A future provider may use Electron's userData directory, a database, or an
 * embedding application's store without changing the window-transfer code.
 */
export interface TerminalSessionMetadataProvider {
  read(sessionId: string): TerminalSessionMetadata | undefined;
  write(metadata: TerminalSessionMetadata): void;
  remove(sessionId: string): void;
}

export interface TerminalSessionMetadataStore {
  remember(metadata: TerminalSessionMetadata): void;
  find(sessionId: string): TerminalSessionMetadata | undefined;
  forget(sessionId: string): void;
}

/** The default provider intentionally performs no storage or I/O. */
export class NoopTerminalSessionMetadataProvider implements TerminalSessionMetadataProvider {
  read(_sessionId: string): TerminalSessionMetadata | undefined {
    return undefined;
  }

  write(_metadata: TerminalSessionMetadata): void {
    // Stub: persistence is injected by a future application-level provider.
  }

  remove(_sessionId: string): void {
    // Stub: persistence is injected by a future application-level provider.
  }
}

class SessionMetadataStore implements TerminalSessionMetadataStore {
  constructor(private readonly provider: TerminalSessionMetadataProvider) {}

  remember(metadata: TerminalSessionMetadata): void {
    this.provider.write(metadata);
  }

  find(sessionId: string): TerminalSessionMetadata | undefined {
    return this.provider.read(sessionId);
  }

  forget(sessionId: string): void {
    this.provider.remove(sessionId);
  }
}

/** Builds the facade; callers may inject persistence without changing callers. */
export function createTerminalSessionMetadataStore(
  provider: TerminalSessionMetadataProvider = new NoopTerminalSessionMetadataProvider(),
): TerminalSessionMetadataStore {
  return new SessionMetadataStore(provider);
}
