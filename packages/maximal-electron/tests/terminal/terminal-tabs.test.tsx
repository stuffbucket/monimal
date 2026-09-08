// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../src/renderer/components/TerminalView.js', () => ({
  TerminalView: ({ id, focused, onSplit, onNavigateSplit }: {
    id: string;
    focused?: boolean;
    onSplit?: (direction: 'right') => void;
    onNavigateSplit?: (direction: 'next') => void;
  }) => (
    <button
      data-session-id={id}
      data-focused={focused || undefined}
      onClick={() => onSplit?.('right')}
      onDoubleClick={() => onNavigateSplit?.('next')}
    />
  ),
}));

import { TerminalTabs } from '../../src/renderer/components/TerminalTabs.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
globalThis.ResizeObserver = class {
  observe(): void {}
  disconnect(): void {}
  unobserve(): void {}
};

describe('TerminalTabs attachments', () => {
  it('keeps renderer tab identity distinct from terminal session identity', () => {
    const markup = renderToStaticMarkup(
      <TerminalTabs
        attachments={[{ id: 'tab-17', sessionId: 'session-4' }]}
        activeId="tab-17"
        transport={{
          spawn: async () => undefined,
          write: async () => undefined,
          resize: async () => undefined,
          terminate: async () => undefined,
          subscribe: () => () => undefined,
        }}
      />,
    );

    expect(markup).toContain('data-session-id="session-4"');
    expect(markup).not.toContain('data-session-id="tab-17"');
  });

  it('inserts a trusted launched session into a resizable split', async () => {
    const launchSplit = vi.fn(async () => ({ sessionId: 'session-5' }));
    const onSessionsChange = vi.fn();
    const terminate = vi.fn(async () => undefined);
    const element = document.createElement('div');
    const root = createRoot(element);

    await act(async () => {
      root.render(
        <TerminalTabs
          attachments={[{ id: 'tab-17', sessionId: 'session-4' }]}
          activeId="tab-17"
          launchSplit={launchSplit}
          onSessionsChange={onSessionsChange}
          transport={{
            spawn: async () => undefined,
            write: async () => undefined,
            resize: async () => undefined,
            terminate,
            subscribe: () => () => undefined,
          }}
        />,
      );
    });

    await act(async () => {
      (element.querySelector('[data-session-id="session-4"]') as HTMLButtonElement).click();
    });

    expect(launchSplit).toHaveBeenCalledOnce();
    expect([...element.querySelectorAll('[data-session-id]')].map((node) =>
      node.getAttribute('data-session-id'))).toEqual(['session-4', 'session-5']);
    expect(element.querySelector('.terminal-split')).not.toBeNull();
    expect(onSessionsChange).toHaveBeenLastCalledWith('tab-17', ['session-4', 'session-5']);
    expect(terminate).not.toHaveBeenCalled();

    await act(async () => {
      (element.querySelector('[data-session-id="session-5"]') as HTMLButtonElement)
        .dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    });
    expect(element.querySelector('[data-session-id="session-4"]')?.getAttribute(
      'data-focused',
    )).toBe('true');

    await act(async () => root.unmount());
    expect(terminate.mock.calls).toEqual([['session-4'], ['session-5']]);
  });

  it('serializes split launches and reports a failed launch', async () => {
    let rejectSplit!: (error: Error) => void;
    const launchSplit = vi.fn(() => new Promise<{ sessionId: string }>((_resolve, reject) => {
      rejectSplit = reject;
    }));
    const element = document.createElement('div');
    const root = createRoot(element);

    await act(async () => {
      root.render(
        <TerminalTabs
          attachments={[{ id: 'tab-17', sessionId: 'session-4' }]}
          activeId="tab-17"
          launchSplit={launchSplit}
          transport={{
            spawn: async () => undefined,
            write: async () => undefined,
            resize: async () => undefined,
            terminate: async () => undefined,
            subscribe: () => () => undefined,
          }}
        />,
      );
    });

    const terminal = element.querySelector('[data-session-id="session-4"]') as HTMLButtonElement;
    await act(async () => {
      terminal.click();
      terminal.click();
    });
    expect(launchSplit).toHaveBeenCalledOnce();

    await act(async () => rejectSplit(new Error('launch failed')));
    expect(element.querySelector('[role="alert"]')?.textContent).toBe(
      'Terminal split could not start.',
    );

    await act(async () => root.unmount());
  });
});