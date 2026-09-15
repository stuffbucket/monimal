// @vitest-environment jsdom
import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useDetachedTerminals } from '../../src/renderer/lib/useDetachedTerminals.js';
import type {
  DetachableTerminalTransport,
  TerminalSession,
} from '../../src/renderer/lib/terminal-transport.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const session = (id: string): TerminalSession => ({
  id,
  cwd: `/tmp/${id}`,
  shell: '/bin/zsh',
  startedAt: 1,
});

function Probe({ transport }: { transport: DetachableTerminalTransport }): ReactElement {
  const { detached, refresh } = useDetachedTerminals(transport, ['attached']);
  return (
    <button type="button" onClick={refresh}>
      {detached.map((item) => item.id).join(',')}
    </button>
  );
}

afterEach(() => document.body.replaceChildren());

describe('useDetachedTerminals', () => {
  it('derives detached sessions and refreshes after host-only changes', async () => {
    let sessions = [session('attached'), session('detached')];
    const transport: DetachableTerminalTransport = {
      spawn: vi.fn(async () => undefined),
      write: vi.fn(async () => undefined),
      resize: vi.fn(async () => undefined),
      terminate: vi.fn(async () => undefined),
      subscribe: vi.fn(() => () => undefined),
      list: vi.fn(async () => sessions),
    };
    const element = document.createElement('div');
    document.body.append(element);
    const root = createRoot(element);

    await act(async () => root.render(<Probe transport={transport} />));
    expect(element.textContent).toBe('detached');

    sessions = [session('attached'), session('later')];
    await act(async () => (element.querySelector('button') as HTMLButtonElement).click());
    expect(element.textContent).toBe('later');
    expect(transport.list).toHaveBeenCalledTimes(2);

    await act(async () => root.unmount());
  });
});