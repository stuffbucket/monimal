/** The versioned DOM drag-data type shared by shell tab strips. */
export const TAB_TRANSFER_MIME = 'application/x-stuffbucket-shell-tab+json';

export interface TabTransfer {
  version: 1;
  sourceFrameId: string;
  tabId: string;
}

export interface TabDetachPosition {
  screenX: number;
  screenY: number;
}

/** Serializes tab identity for a same-origin frame or window drop. */
export function encodeTabTransfer(transfer: TabTransfer): string {
  return JSON.stringify(transfer);
}

/** Reads supported tab identity without trusting arbitrary drag data. */
export function decodeTabTransfer(value: string): TabTransfer | undefined {
  try {
    const candidate = JSON.parse(value) as Partial<TabTransfer>;
    if (
      candidate.version !== 1 ||
      typeof candidate.sourceFrameId !== 'string' ||
      candidate.sourceFrameId === '' ||
      typeof candidate.tabId !== 'string' ||
      candidate.tabId === ''
    ) return undefined;
    return {
      version: 1,
      sourceFrameId: candidate.sourceFrameId,
      tabId: candidate.tabId,
    };
  }
  // Stryker disable next-line BlockStatement: invalid JSON and this return both yield undefined.
  catch {
    return undefined;
  }
}

/** Returns a copy with one tab inserted before a target or at the end. */
export function moveTabBefore<T extends { id: string }>(
  tabs: readonly T[],
  tabId: string,
  beforeTabId?: string,
): T[] {
  const moved = tabs.find((tab) => tab.id === tabId);
  if (!moved) return [...tabs];
  const remaining = tabs.filter((tab) => tab.id !== tabId);
  const targetIndex = beforeTabId === undefined
    ? remaining.length
    : remaining.findIndex((tab) => tab.id === beforeTabId);
  if (targetIndex < 0) return [...tabs];
  return [
    ...remaining.slice(0, targetIndex),
    moved,
    ...remaining.slice(targetIndex),
  ];
}