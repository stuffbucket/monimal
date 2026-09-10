// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AgentApprovalRequest,
  AgentEnd,
  AgentToolEvent,
  ModelProgress,
  ProviderStatus,
} from '../src/contracts.js';
import { Overlay, type HarnessTransport } from '../src/renderer/Overlay.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

interface Channel<T> {
  emit: (value: T) => void;
  subscribe: (listener: (value: T) => void) => () => void;
  unsubscribe: ReturnType<typeof vi.fn>;
}

function channel<T>(): Channel<T> {
  let listener: ((value: T) => void) | undefined;
  const unsubscribe = vi.fn();
  return {
    emit(value) {
      listener?.(value);
    },
    subscribe: vi.fn((next: (value: T) => void) => {
      listener = next;
      return unsubscribe;
    }),
    unsubscribe,
  };
}

function fakeTransport(initialStatus: ProviderStatus = {
  state: 'ready',
  provider: 'embedded',
  model: 'local-model',
}) {
  let status = initialStatus;
  const delta = channel<string>();
  const tool = channel<AgentToolEvent>();
  const approval = channel<AgentApprovalRequest>();
  const end = channel<AgentEnd>();
  const modelProgress = channel<ModelProgress>();
  const transport: HarnessTransport = {
    hide: vi.fn(() => Promise.resolve()),
    provider: vi.fn(() => Promise.resolve(status)),
    ask: vi.fn(() => Promise.resolve({ started: true as const })),
    abort: vi.fn(() => Promise.resolve()),
    approve: vi.fn(() => Promise.resolve()),
    ensureModel: vi.fn(() => Promise.resolve({ state: 'ready' as const })),
    onDelta: delta.subscribe,
    onTool: tool.subscribe,
    onApproval: approval.subscribe,
    onEnd: end.subscribe,
    onModelProgress: modelProgress.subscribe,
  };

  return {
    transport,
    delta,
    tool,
    approval,
    end,
    modelProgress,
    setStatus(next: ProviderStatus) {
      status = next;
    },
  };
}

let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function renderOverlay(transport: HarnessTransport): Promise<void> {
  act(() => root?.render(<Overlay transport={transport} />));
  await settle();
}

function byTestId(id: string): HTMLElement {
  const found = document.body.querySelector<HTMLElement>(`[data-testid="${id}"]`);
  if (!found) throw new Error(`Element not found: ${id}`);
  return found;
}

function inputText(value: string): void {
  const input = byTestId('overlay-input');
  if (!(input instanceof HTMLTextAreaElement)) throw new Error('Overlay input is not a textarea');
  Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set?.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function keyDown(target: EventTarget, key: string, shiftKey = false): KeyboardEvent {
  const event = new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key, shiftKey });
  target.dispatchEvent(event);
  return event;
}

function click(id: string): void {
  const element = byTestId(id);
  if (!(element instanceof HTMLButtonElement)) throw new Error(`${id} is not a button`);
  element.click();
}

describe('Overlay', () => {
  it('probes on mount and focus, focuses the prompt, and exposes a named modal', async () => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);

    expect(fake.transport.provider).toHaveBeenCalledTimes(1);
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    const labelledBy = dialog?.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy ?? '')?.textContent).toBe('Ask the agent');

    const input = byTestId('overlay-input');
    expect(input).toBeInstanceOf(HTMLTextAreaElement);
    expect((input as HTMLTextAreaElement).disabled).toBe(false);
    expect(document.activeElement).toBe(input);
    input.blur();

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await settle();
    expect(fake.transport.provider).toHaveBeenCalledTimes(2);
    expect(document.activeElement).toBe(input);

    fake.setStatus({ state: 'unavailable', reason: 'No local provider found' });
    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await settle();
    expect(fake.transport.provider).toHaveBeenCalledTimes(3);
    expect(byTestId('overlay-status').textContent).toBe('No local provider found');
    expect((input as HTMLTextAreaElement).disabled).toBe(true);
  });

  it('submits trimmed input and renders streamed text, tool state, and completion', async () => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);

    act(() => {
      inputText('  explain this  ');
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    await settle();

    expect(fake.transport.ask).toHaveBeenCalledWith('explain this');
    expect((byTestId('overlay-input') as HTMLTextAreaElement).value).toBe('');
    expect(byTestId('overlay-status').textContent).toBe('Thinking…');

    act(() => {
      fake.delta.emit('Hello');
      fake.delta.emit(' world');
      fake.tool.emit({ name: 'read', phase: 'start' });
    });
    expect(byTestId('overlay-answer').textContent).toBe('Hello world');
    expect(byTestId('overlay-status').textContent).toBe('Running read…');

    act(() => fake.tool.emit({ name: 'read', phase: 'end' }));
    expect(byTestId('overlay-status').textContent).toBe('Thinking…');

    act(() => fake.end.emit({ ok: false, error: 'Model stopped' }));
    expect(byTestId('overlay-answer').textContent).toBe('Hello worldModel stopped');
    expect(byTestId('overlay-status').textContent).toBe('embedded · local-model');
  });

  it('aborts before dismissing and denies approval before an outside dismissal', async () => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);

    act(() => {
      inputText('run');
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    await settle();

    act(() => {
      keyDown(document, 'Escape');
    });
    expect(fake.transport.abort).toHaveBeenCalledTimes(1);
    expect(fake.transport.hide).not.toHaveBeenCalled();

    act(() => {
      keyDown(document, 'Escape');
    });
    expect(fake.transport.hide).toHaveBeenCalledTimes(1);

    act(() => fake.approval.emit({ id: 'approval-1', tool: 'bash', summary: 'rm draft' }));
    const scrim = document.body.querySelector('.mh-scrim');
    if (!scrim) throw new Error('Overlay scrim not found');
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    act(() => {
      scrim.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, cancelable: true }));
      scrim.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    });

    expect(fake.transport.approve).toHaveBeenCalledWith({
      id: 'approval-1',
      allow: false,
      remember: false,
    });
    expect(fake.transport.hide).toHaveBeenCalledTimes(2);
  });

  it('supports approval buttons and gives approval Enter priority over a draft prompt', async () => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);

    act(() => fake.approval.emit({ id: 'approval-1', tool: 'write', summary: '/tmp/file' }));
    expect(byTestId('overlay-approval-summary').textContent).toBe('/tmp/file');
    expect(byTestId('overlay-status').textContent).toBe('Waiting for you to approve write');
    act(() => click('overlay-allow-always'));
    expect(fake.transport.approve).toHaveBeenLastCalledWith({
      id: 'approval-1',
      allow: true,
      remember: true,
    });

    act(() => {
      inputText('do not send this');
      fake.approval.emit({ id: 'approval-2', tool: 'bash', summary: 'pwd' });
    });
    act(() => {
      keyDown(byTestId('overlay-input'), 'Enter');
    });

    expect(fake.transport.approve).toHaveBeenLastCalledWith({
      id: 'approval-2',
      allow: true,
      remember: false,
    });
    expect(fake.transport.ask).not.toHaveBeenCalled();

    act(() => fake.approval.emit({ id: 'approval-3', tool: 'edit', summary: 'notes.txt' }));
    act(() => click('overlay-deny'));
    expect(fake.transport.approve).toHaveBeenLastCalledWith({
      id: 'approval-3',
      allow: false,
      remember: false,
    });
  });

  it('starts a model download, reports progress, and re-probes when ready', async () => {
    const fake = fakeTransport({ state: 'needs-model', model: 'coder.gguf', approxMb: 4000 });
    let finishDownload!: (progress: ModelProgress) => void;
    vi.mocked(fake.transport.ensureModel).mockReturnValue(new Promise((resolve) => {
      finishDownload = resolve;
    }));
    await renderOverlay(fake.transport);

    expect(byTestId('overlay-setup').textContent).toContain('About 4000 MB');
    act(() => click('overlay-download-start'));
    expect(fake.transport.ensureModel).toHaveBeenCalledTimes(1);
    expect(byTestId('overlay-download').textContent).toContain('Starting…');

    act(() => fake.modelProgress.emit({
      state: 'downloading',
      received: 1_000_000,
      total: 4_000_000,
    }));
    expect(byTestId('overlay-download').textContent).toContain('1 MB of 4 MB');
    expect(document.body.querySelector<HTMLElement>('.mh-setup__bar')?.style.width).toBe('25%');

    fake.setStatus({ state: 'ready', provider: 'ollama', model: 'coder' });
    act(() => fake.modelProgress.emit({ state: 'ready' }));
    await settle();
    expect(fake.transport.provider).toHaveBeenCalledTimes(2);
    expect(byTestId('overlay-status').textContent).toBe('ollama · coder');

    act(() => finishDownload({ state: 'ready' }));
    await settle();
  });

  it('unsubscribes transport and window listeners on unmount', async () => {
    const remove = vi.spyOn(window, 'removeEventListener');
    const fake = fakeTransport();
    await renderOverlay(fake.transport);

    act(() => root?.unmount());
    root = undefined;

    for (const event of [fake.delta, fake.tool, fake.approval, fake.end, fake.modelProgress]) {
      expect(event.unsubscribe).toHaveBeenCalledTimes(1);
    }
    expect(remove.mock.calls.filter(([type]) => type === 'focus')).toHaveLength(2);

    window.dispatchEvent(new Event('focus'));
    expect(fake.transport.provider).toHaveBeenCalledTimes(1);
  });
});
