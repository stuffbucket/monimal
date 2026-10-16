// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AgentEffort,
  AssistantChatMessage,
  AssistantOverlayPreferences,
  AssistantRunApprovalRequest,
  AssistantRunDelta,
  AssistantRunEnd,
  AssistantRunToolEvent,
  ModelDownloadProgress,
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
  state: 'ready' as const,
  provider: 'embedded',
  model: 'local-model',
  modelKey: 'embedded:local-model',
  models: [
    {
      key: 'embedded:local-model',
      label: 'local-model',
      model: 'local-model',
      provider: 'embedded',
      description: 'Runs privately on this Mac',
      efforts: [],
    },
  ],
}) {
  let status = initialStatus;
  const delta = channel<AssistantRunDelta>();
  const tool = channel<AssistantRunToolEvent>();
  const approval = channel<AssistantRunApprovalRequest>();
  const end = channel<AssistantRunEnd>();
  const modelProgress = channel<ModelDownloadProgress>();
  const shown = channel<void>();
  const dismissRequested = channel<void>();
  const preferences = channel<AssistantOverlayPreferences>();
  const chatSelected = channel<string>();
  const transport: HarnessTransport = {
    initialRunId: 'fixture-run',
    hide: vi.fn(() => Promise.resolve()),
    provider: vi.fn(() => Promise.resolve(status)),
    selectModel: vi.fn((modelKey: string) => {
      if (!('models' in status)) return Promise.reject(new Error('unavailable'));
      const models = status.models;
      const selected = models.find((model) => model.key === modelKey);
      if (!selected) return Promise.reject(new Error('unavailable'));
      status = {
        state: 'ready',
        provider: selected.provider,
        model: selected.model,
        modelKey: selected.key,
        models,
      };
      return Promise.resolve(status);
    }),
    selectEffort: vi.fn(() => Promise.resolve(status)),
    ask: vi.fn((_prompt: string, runId: string) => Promise.resolve({
      started: true as const,
      chatId: 'chat-1',
      runId,
    })),
    steer: vi.fn(() => Promise.resolve(true)),
    abort: vi.fn(() => Promise.resolve()),
    approve: vi.fn(() => Promise.resolve()),
    ensureModel: vi.fn((request) => Promise.resolve({
      ...request,
      progress: { state: 'ready' as const },
    })),
    preferences: vi.fn(() => Promise.resolve({
      candy: true,
      approval: 'writes' as const,
      outputFont: 'auto' as const,
      hotkey: 'CommandOrControl+Shift+Space',
    })),
    updatePreferences: vi.fn((
      update: Partial<Pick<AssistantOverlayPreferences, 'candy' | 'approval' | 'outputFont'>>,
    ) => Promise.resolve({
      candy: update.candy ?? true,
      approval: update.approval ?? 'writes',
      outputFont: update.outputFont ?? 'auto',
      hotkey: 'CommandOrControl+Shift+Space',
    })),
    chats: {
      list: vi.fn(() => Promise.resolve({ chats: [], total: 0 })),
      create: vi.fn(() => Promise.resolve({
        id: 'chat-1',
        title: 'New chat',
        status: 'active' as const,
        attention: 'read' as const,
        pinned: false,
        createdAt: 1,
        updatedAt: 1,
        lastOpenedAt: 1,
      })),
      open: vi.fn(() => Promise.resolve({
        id: 'chat-1',
        title: 'New chat',
        status: 'active' as const,
        attention: 'read' as const,
        pinned: false,
        createdAt: 1,
        updatedAt: 1,
        lastOpenedAt: 1,
      })),
      update: vi.fn(),
      remove: vi.fn(() => Promise.resolve()),
      messages: vi.fn(() => Promise.resolve([])),
      terminal: vi.fn(() => Promise.resolve({})),
    },
    onDelta: delta.subscribe,
    onTool: tool.subscribe,
    onApproval: approval.subscribe,
    onEnd: end.subscribe,
    onModelProgress: modelProgress.subscribe,
    onShown: shown.subscribe,
    onDismissRequested: dismissRequested.subscribe,
    onPreferences: preferences.subscribe,
    onChatSelected: chatSelected.subscribe,
  };

  return {
    transport,
    delta,
    tool,
    approval,
    end,
    modelProgress,
    shown,
    dismissRequested,
    preferences,
    chatSelected,
    runId(index = vi.mocked(transport.ask).mock.calls.length - 1) {
      const runId = vi.mocked(transport.ask).mock.calls[index]?.[1];
      if (runId === undefined) throw new Error(`Missing run id at ask call ${String(index)}.`);
      return runId;
    },
    setStatus(next: ProviderStatus) {
      status = next;
    },
  };
}

let container: HTMLDivElement;
let root: Root | undefined;

beforeEach(() => {
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => null);
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  if (root) act(() => root?.unmount());
  root = undefined;
  document.body.replaceChildren();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function settle(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
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

function keyDown(
  target: EventTarget,
  key: string,
  shiftKey = false,
  metaKey = false,
  ctrlKey = false,
): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    key,
    shiftKey,
    metaKey,
    ctrlKey,
  });
  target.dispatchEvent(event);
  return event;
}

function click(id: string): void {
  const element = byTestId(id);
  if (!(element instanceof HTMLButtonElement)) throw new Error(`${id} is not a button`);
  element.click();
}

function finishCardAnimation(): void {
  byTestId('overlay-card').dispatchEvent(
    new Event('animationend', { bubbles: true }),
  );
}

describe('Overlay', () => {
  it('probes on mount and focus, focuses the prompt, and exposes a named modeless dialog', async () => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);

    expect(fake.transport.provider).toHaveBeenCalledTimes(1);
    const dialog = document.body.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.getAttribute('aria-modal')).toBeNull();
    const labelledBy = dialog?.getAttribute('aria-labelledby');
    expect(labelledBy).toBeTruthy();
    expect(document.getElementById(labelledBy ?? '')?.textContent).toBe('Ask the agent');

    const input = byTestId('overlay-input');
    expect(input).toBeInstanceOf(HTMLTextAreaElement);
    expect((input as HTMLTextAreaElement).disabled).toBe(false);
    expect(document.activeElement).toBe(input);
    expect(document.body.querySelector('[data-testid="overlay-stage"]')).toBeNull();
    expect(byTestId('overlay-attach')).toBeInstanceOf(HTMLButtonElement);
    expect(byTestId('overlay-send')).toBeInstanceOf(HTMLButtonElement);
    expect(byTestId('overlay-attach').classList).toContain('mh-composer__button');
    expect(byTestId('overlay-open-terminal').classList).toContain('mh-composer__button');
    expect(byTestId('overlay-permissions').textContent).toContain('Permissions');
    for (const id of [
      'overlay-model-picker',
      'overlay-conversation',
      'overlay-permissions',
    ]) {
      expect(byTestId(id).classList).toContain('maximal-button');
      expect(byTestId(id).classList).toContain('mh-select-trigger');
    }
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

  it('ignores stale provider and preference responses', async () => {
    const fake = fakeTransport();
    const firstProvider = deferred<ProviderStatus>();
    const secondProvider = deferred<ProviderStatus>();
    const initialPreferences = deferred<AssistantOverlayPreferences>();
    vi.mocked(fake.transport.provider)
      .mockReturnValueOnce(firstProvider.promise)
      .mockReturnValueOnce(secondProvider.promise);
    vi.mocked(fake.transport.preferences).mockReturnValue(initialPreferences.promise);
    await renderOverlay(fake.transport);

    act(() => {
      window.dispatchEvent(new Event('focus'));
    });
    await act(async () => {
      secondProvider.resolve({
        state: 'ready',
        provider: 'embedded',
        model: 'newer-model',
        modelKey: 'embedded:newer-model',
        models: [{
          key: 'embedded:newer-model',
          label: 'newer-model',
          model: 'newer-model',
          provider: 'embedded',
          description: 'newer',
          efforts: [],
        }],
      });
      await secondProvider.promise;
    });
    await act(async () => {
      firstProvider.resolve({ state: 'unavailable', reason: 'stale provider result' });
      await firstProvider.promise;
    });
    expect(byTestId('overlay-model-picker').textContent).toContain('newer-model');
    expect(byTestId('overlay-status').textContent).not.toContain('stale provider result');

    act(() => fake.preferences.emit({
      candy: false,
      approval: 'all',
      outputFont: 'terminal',
      hotkey: 'new',
    }));
    await act(async () => {
      initialPreferences.resolve({
        candy: true,
        approval: 'writes',
        outputFont: 'auto',
        hotkey: 'stale',
      });
      await initialPreferences.promise;
    });
    expect(byTestId('overlay-card').classList).toContain('mh-card--font-terminal');
    expect(byTestId('overlay-card').classList).not.toContain('mh-card-candy');
  });

  it('submits trimmed input and renders streamed text, tool state, and completion', async () => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);

    act(() => {
      inputText('  explain this  ');
      keyDown(byTestId('overlay-input'), 'Enter');
    });

    await settle();

    expect(fake.transport.ask).toHaveBeenCalledWith(
      'explain this',
      fake.runId(),
      undefined,
    );
    expect((byTestId('overlay-input') as HTMLTextAreaElement).value).toBe('');
    expect(byTestId('overlay-status').textContent).toBe('Thinking…');
    expect(byTestId('overlay-answer').textContent).toContain('Youexplain this');
    expect(byTestId('overlay-stop')).toBeInstanceOf(HTMLButtonElement);

    act(() => {
      fake.delta.emit({ runId: fake.runId(), text: 'Hello' });
      fake.delta.emit({ runId: fake.runId(), text: ' world' });
      fake.tool.emit({
        runId: fake.runId(),
        id: 'tool-1',
        name: 'read',
        phase: 'start',
      });
    });
    expect(byTestId('overlay-answer').textContent).toContain('Hello world');
    expect(byTestId('overlay-status').textContent).toBe('Running read…');
    expect(byTestId('overlay-tools').textContent).toContain('Reading context⌄readrunning');
    expect(byTestId('overlay-tools').querySelector('details')?.open).toBe(true);
    expect(byTestId('overlay-tools').querySelector('.mh-tool-running')).toBeTruthy();

    act(() => fake.tool.emit({
      runId: fake.runId(),
      id: 'tool-1',
      name: 'read',
      phase: 'end',
    }));
    expect(byTestId('overlay-status').textContent).toBe('Thinking…');
    expect(byTestId('overlay-tools').textContent).toContain('Reading context⌄readcomplete');
    expect(byTestId('overlay-tools').querySelector('details')?.open).toBe(false);

    act(() => fake.end.emit({
      runId: fake.runId(),
      result: { ok: false, error: 'Model stopped' },
    }));
    expect(byTestId('overlay-answer').textContent).toContain('Hello worldModel stopped');
    expect(byTestId('overlay-status').textContent).toBe('');
  });

  it('rejects an ask response with a different run identity', async () => {
    const fake = fakeTransport();
    vi.mocked(fake.transport.ask).mockResolvedValueOnce({
      started: true,
      chatId: 'chat-unexpected',
      runId: 'unexpected-run',
    });
    await renderOverlay(fake.transport);

    act(() => {
      inputText('explain this');
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    await settle();

    expect(byTestId('overlay-answer').textContent).toContain(
      'The response started with an unexpected operation identity.',
    );
    expect(byTestId('overlay-status').textContent).toBe('');
    expect((byTestId('overlay-input') as HTMLTextAreaElement).value).toBe(
      'explain this',
    );
  });

  it('supports shell history, transcript toggling, and steering a busy run', async () => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);

    act(() => {
      inputText('first prompt');
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    await settle();

    act(() => {
      inputText('/btw focus on tests');
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    await settle();
    expect(fake.transport.steer).toHaveBeenCalledWith('focus on tests', 'chat-1');

    act(() => {
      fake.end.emit({ runId: fake.runId(), result: { ok: true } });
    });
    act(() => {
      keyDown(byTestId('overlay-input'), 'ArrowUp');
    });
    expect((byTestId('overlay-input') as HTMLTextAreaElement).value).toBe('/btw focus on tests');
    act(() => {
      keyDown(byTestId('overlay-input'), 'ArrowDown');
    });
    expect((byTestId('overlay-input') as HTMLTextAreaElement).value).toBe('');

    act(() => {
      keyDown(byTestId('overlay-card'), 'o', false, false, true);
    });
    expect(document.body.querySelector('[data-testid="overlay-stage"]')).toBeNull();
    act(() => {
      keyDown(byTestId('overlay-card'), 'o', false, false, true);
    });
    expect(byTestId('overlay-stage')).toBeTruthy();
  });

  it('attaches supported documents and includes their contents in the prompt', async () => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);
    const fileInput = byTestId('overlay-file-input');
    const file = new File(['hello from the file'], 'notes.txt', { type: 'text/plain' });
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });

    act(() => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
    expect(byTestId('overlay-attachments').textContent).toContain('notes.txt');

    act(() => {
      inputText('summarize');
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    await settle();
    expect(fake.transport.ask).toHaveBeenCalledWith(
      expect.stringContaining('<attachment name="notes.txt">'),
      fake.runId(),
      undefined,
    );
  });

  it('restores the complete draft when a request is rejected', async () => {
    const fake = fakeTransport();
    vi.mocked(fake.transport.ask).mockRejectedValue(new Error('IPC failed'));
    await renderOverlay(fake.transport);
    const fileInput = byTestId('overlay-file-input');
    const file = new File(['keep this'], 'draft.txt', { type: 'text/plain' });
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });

    act(() => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
    act(() => {
      inputText('keep this prompt');
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    await settle();

    expect((byTestId('overlay-input') as HTMLTextAreaElement).value).toBe('keep this prompt');
    expect(byTestId('overlay-attachments').textContent).toContain('draft.txt');
    expect(byTestId('overlay-answer').textContent).not.toContain('Youkeep this prompt');
  });

  it('rejects oversized attachments before reading or invoking the transport', async () => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);
    const fileInput = byTestId('overlay-file-input');
    const file = new File(['small'], 'oversized.txt', { type: 'text/plain' });
    Object.defineProperty(file, 'size', { configurable: true, value: 10_000_001 });
    Object.defineProperty(fileInput, 'files', { configurable: true, value: [file] });

    act(() => {
      fileInput.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();

    expect(byTestId('overlay-answer').textContent).toContain(
      'oversized.txt exceeds the 10 MB attachment limit.',
    );
    expect(document.body.querySelector('[data-testid="overlay-attachments"]')).toBeNull();
    expect(fake.transport.ask).not.toHaveBeenCalled();
  });

  it('keeps aborting busy until the matching run ends', async () => {
    const fake = fakeTransport();
    const abortResult = deferred<void>();
    vi.mocked(fake.transport.abort).mockReturnValue(abortResult.promise);
    await renderOverlay(fake.transport);

    act(() => {
      inputText('first');
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    await settle();
    act(() => click('overlay-stop'));

    expect(fake.transport.abort).toHaveBeenCalledTimes(1);
    expect(byTestId('overlay-stop')).toBeInstanceOf(HTMLButtonElement);
    act(() => {
      inputText('must wait');
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    expect(fake.transport.ask).toHaveBeenCalledTimes(1);
    expect(fake.transport.steer).not.toHaveBeenCalled();

    act(() => fake.end.emit({ runId: fake.runId(), result: { ok: true } }));
    expect(byTestId('overlay-send')).toBeInstanceOf(HTMLButtonElement);
    abortResult.resolve();
  });

  it('ignores a delayed delta from a completed run after a new run starts', async () => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);

    act(() => {
      inputText('first');
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    await settle();
    const firstRunId = fake.runId();
    act(() => fake.end.emit({ runId: firstRunId, result: { ok: true } }));
    act(() => {
      inputText('second');
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    await settle();
    const secondRunId = fake.runId();

    act(() => fake.delta.emit({ runId: firstRunId, text: 'stale first response' }));

    expect(byTestId('overlay-answer').textContent).not.toContain(
      'stale first response',
    );
    expect(byTestId('overlay-status').textContent).toBe('Thinking…');
    act(() => fake.delta.emit({ runId: secondRunId, text: 'current response' }));
    expect(byTestId('overlay-answer').textContent).toContain('current response');
  });

  it('ignores a duplicated end from a completed run after a new run starts', async () => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);

    act(() => {
      inputText('first');
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    await settle();
    const firstRunId = fake.runId();
    act(() => fake.end.emit({ runId: firstRunId, result: { ok: true } }));
    act(() => {
      inputText('second');
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    await settle();
    const secondRunId = fake.runId();

    act(() => fake.end.emit({
      runId: firstRunId,
      result: { ok: false, error: 'stale first failure' },
    }));

    expect(byTestId('overlay-status').textContent).toBe('Thinking…');
    expect(byTestId('overlay-stop')).toBeInstanceOf(HTMLButtonElement);
    expect(byTestId('overlay-answer').textContent).not.toContain(
      'stale first failure',
    );
    act(() => fake.end.emit({ runId: secondRunId, result: { ok: true } }));
    expect(byTestId('overlay-send')).toBeInstanceOf(HTMLButtonElement);
  });

  it('ignores a late abort rejection after the run already ended', async () => {
    const fake = fakeTransport();
    const abortResult = deferred<void>();
    vi.mocked(fake.transport.abort).mockReturnValue(abortResult.promise);
    await renderOverlay(fake.transport);

    act(() => {
      inputText('first');
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    await settle();
    act(() => click('overlay-stop'));
    const firstRunId = fake.runId();
    act(() => fake.end.emit({ runId: firstRunId, result: { ok: true } }));
    act(() => {
      inputText('replacement');
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    await settle();
    const replacementRunId = fake.runId();
    await act(async () => {
      abortResult.reject(new Error('late abort failure'));
      await abortResult.promise.catch(() => undefined);
    });

    expect(byTestId('overlay-answer').textContent).not.toContain(
      'The current response could not be stopped.',
    );
    expect(byTestId('overlay-status').textContent).toBe('Thinking…');
    act(() => fake.end.emit({
      runId: replacementRunId,
      result: { ok: true },
    }));
    expect(byTestId('overlay-status').textContent).toBe('');
  });

  it('ignores unsolicited run events before a request exists', async () => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);

    act(() => {
      fake.delta.emit({ runId: 'unknown', text: 'unsolicited' });
      fake.end.emit({
        runId: 'unknown',
        result: { ok: false, error: 'unsolicited failure' },
      });
    });

    expect(document.body.textContent).not.toContain('unsolicited');
    expect(document.body.textContent).not.toContain(
      'unsolicited failure',
    );
    expect(byTestId('overlay-status').textContent).toBe('');
  });

  it('ignores stale tool and approval events after a replacement run starts', async () => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);

    act(() => {
      inputText('first');
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    await settle();
    const firstRunId = fake.runId();
    act(() => fake.end.emit({ runId: firstRunId, result: { ok: true } }));

    act(() => {
      inputText('second');
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    await settle();
    const secondRunId = fake.runId();

    act(() => {
      fake.tool.emit({
        runId: firstRunId,
        id: 'stale-tool',
        name: 'bash',
        phase: 'start',
      });
      fake.approval.emit({
        runId: firstRunId,
        id: 'stale-approval',
        tool: 'write',
        summary: 'stale.txt',
      });
    });
    expect(document.body.textContent).not.toContain('stale-tool');
    expect(document.body.textContent).not.toContain('stale.txt');
    expect(byTestId('overlay-status').textContent).toBe('Thinking…');

    act(() => {
      fake.tool.emit({
        runId: secondRunId,
        id: 'current-tool',
        name: 'read',
        phase: 'start',
      });
      fake.approval.emit({
        runId: secondRunId,
        id: 'current-approval',
        tool: 'read',
        summary: 'current.txt',
      });
    });
    expect(byTestId('overlay-tools').textContent).toContain('read');
    expect(byTestId('overlay-tools').textContent).not.toContain('bash');
    expect(byTestId('overlay-approval-summary').textContent).toBe('current.txt');
  });

  it('ignores a late approval rejection after a replacement run asks for approval', async () => {
    const fake = fakeTransport();
    const firstDecision = deferred<void>();
    vi.mocked(fake.transport.approve).mockReturnValueOnce(firstDecision.promise);
    await renderOverlay(fake.transport);

    act(() => fake.approval.emit({
      runId: 'fixture-run',
      id: 'approval-1',
      tool: 'write',
      summary: 'first.txt',
    }));
    act(() => click('overlay-allow'));
    act(() => fake.end.emit({
      runId: 'fixture-run',
      result: { ok: true },
    }));

    act(() => {
      inputText('replacement');
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    await settle();
    const replacementRunId = fake.runId();
    act(() => fake.approval.emit({
      runId: replacementRunId,
      id: 'approval-2',
      tool: 'write',
      summary: 'replacement.txt',
    }));

    await act(async () => {
      firstDecision.reject(new Error('late approval failure'));
      await firstDecision.promise.catch(() => undefined);
    });

    expect(byTestId('overlay-approval-summary').textContent).toBe(
      'replacement.txt',
    );
    expect((byTestId('overlay-allow') as HTMLButtonElement).disabled).toBe(false);
    expect(document.body.textContent).not.toContain(
      'The approval decision could not be sent.',
    );
  });

  it('prevents conversation changes while operation events are in flight', async () => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);

    act(() => {
      inputText('first');
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    await settle();
    expect((byTestId('overlay-conversation') as HTMLButtonElement).disabled).toBe(true);

    act(() => fake.chatSelected.emit('other-chat'));
    await settle();
    expect(fake.transport.chats.open).not.toHaveBeenCalled();
    expect(fake.transport.chats.messages).not.toHaveBeenCalled();
  });

  it('ignores a stale conversation response after a newer selection', async () => {
    const fake = fakeTransport();
    const first = deferred<AssistantChatMessage[]>();
    const second = deferred<AssistantChatMessage[]>();
    vi.mocked(fake.transport.chats.messages)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    await renderOverlay(fake.transport);

    act(() => fake.chatSelected.emit('chat-a'));
    await settle();
    act(() => fake.chatSelected.emit('chat-b'));
    await settle();
    await act(async () => {
      second.resolve([{
        id: 2,
        chatId: 'chat-b',
        role: 'assistant',
        content: 'newer',
        createdAt: 2,
      }]);
      await second.promise;
    });
    expect(byTestId('overlay-answer').textContent).toContain('newer');

    await act(async () => {
      first.resolve([{
        id: 1,
        chatId: 'chat-a',
        role: 'assistant',
        content: 'stale',
        createdAt: 1,
      }]);
      await first.promise;
    });
    expect(byTestId('overlay-answer').textContent).not.toContain('stale');
    expect(byTestId('overlay-conversation').textContent).toContain('Recent chat');
  });

  it('keeps an approval available when sending its decision fails', async () => {
    const fake = fakeTransport();
    vi.mocked(fake.transport.approve).mockRejectedValue(new Error('IPC failed'));
    await renderOverlay(fake.transport);

    act(() => fake.approval.emit({
      runId: 'fixture-run',
      id: 'approval-1',
      tool: 'write',
      summary: 'file.txt',
    }));
    act(() => click('overlay-allow'));
    expect((byTestId('overlay-allow') as HTMLButtonElement).disabled).toBe(true);
    await settle();

    expect(byTestId('overlay-approval-summary').textContent).toBe('file.txt');
    expect((byTestId('overlay-allow') as HTMLButtonElement).disabled).toBe(false);
    expect(byTestId('overlay-answer').textContent).toContain(
      'The approval decision could not be sent.',
    );
  });

  it('focuses the closed model picker when the preference is unavailable', async () => {
    const models = [
      {
        key: 'ollama:qwen3:4b',
        label: 'qwen3:4b',
        model: 'qwen3:4b',
        provider: 'ollama' as const,
        description: 'Local model via Ollama',
        efforts: [],
      },
      {
        key: 'embedded:small.gguf',
        label: 'small',
        model: 'small.gguf',
        provider: 'embedded' as const,
        description: 'Runs privately on this Mac',
        efforts: [],
      },
      {
        key: 'maximal:qwen-alias',
        label: 'qwen3:4b',
        model: 'qwen-alias',
        provider: 'maximal' as const,
        description: 'Available through Maximal',
        efforts: [],
      },
    ];
    const fake = fakeTransport({
      state: 'select-model',
      preferredModel: 'maximal:missing',
      models,
    });
    await renderOverlay(fake.transport);

    const picker = byTestId('overlay-model-picker');
    expect(picker).toBeInstanceOf(HTMLButtonElement);
    expect(document.activeElement).toBe(picker);
    expect((byTestId('overlay-input') as HTMLTextAreaElement).disabled).toBe(true);
    expect(byTestId('overlay-stage')).toBeTruthy();
    expect(byTestId('overlay-model-unavailable').textContent).toContain(
      'The selected model is not available at this time.',
    );

    act(() => {
      picker.click();
    });
    expect(document.body.querySelectorAll('[data-testid^="menu-"]')).toHaveLength(2);
    expect(byTestId('menu-ollama:qwen3:4b').textContent).toBe('qwen3:4b');
    act(() => {
      byTestId('menu-embedded:small.gguf').click();
    });
    await settle();

    expect(fake.transport.selectModel).toHaveBeenCalledWith(
      'embedded:small.gguf',
    );
    expect((byTestId('overlay-input') as HTMLTextAreaElement).disabled).toBe(false);
    expect(document.activeElement).toBe(byTestId('overlay-input'));
  });

  it('keeps the latest model selection when an earlier request finishes last', async () => {
    const models = [
      {
        key: 'ollama:first',
        label: 'first',
        model: 'first',
        provider: 'ollama' as const,
        description: 'First model',
        efforts: [],
      },
      {
        key: 'embedded:second',
        label: 'second',
        model: 'second',
        provider: 'embedded' as const,
        description: 'Second model',
        efforts: [],
      },
    ];
    const fake = fakeTransport({
      state: 'select-model',
      models,
    });
    const first = deferred<ProviderStatus>();
    const second = deferred<ProviderStatus>();
    vi.mocked(fake.transport.selectModel)
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    await renderOverlay(fake.transport);

    act(() => click('overlay-model-picker'));
    act(() => byTestId('menu-ollama:first').click());
    act(() => click('overlay-model-picker'));
    act(() => byTestId('menu-embedded:second').click());

    await act(async () => {
      second.resolve({
        state: 'ready',
        provider: 'embedded',
        model: 'second',
        modelKey: 'embedded:second',
        models,
      });
      await second.promise;
    });
    expect(byTestId('overlay-model-picker').textContent).toContain('second');

    await act(async () => {
      first.resolve({
        state: 'ready',
        provider: 'ollama',
        model: 'first',
        modelKey: 'ollama:first',
        models,
      });
      await first.promise;
    });
    expect(byTestId('overlay-model-picker').textContent).toContain('second');
  });

  it('keeps a transparent outside-click target and hides when it is pressed', async () => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);

    act(() => {
      byTestId('overlay-click-away').dispatchEvent(
        new MouseEvent('pointerdown', { bubbles: true }),
      );
    });
    await settle();

    expect(byTestId('overlay-card').classList).toContain('mh-card--exiting');
    expect(fake.transport.hide).not.toHaveBeenCalled();
    act(finishCardAnimation);
    expect(fake.transport.hide).toHaveBeenCalledTimes(1);
  });

  it('changes reasoning effort without dismissing the card', async () => {
    const model = {
      key: 'maximal:claude',
      label: 'Claude',
      model: 'claude',
      provider: 'maximal' as const,
      description: 'Extended reasoning · 200K context',
      efforts: ['low', 'medium', 'high', 'xhigh', 'max'] as const,
    };
    const fake = fakeTransport({
      state: 'ready',
      provider: 'maximal' as const,
      model: model.model,
      modelKey: model.key,
      models: [{ ...model, efforts: [...model.efforts] }],
      effort: 'medium',
    });
    fake.transport.selectEffort = vi.fn((effort: AgentEffort) => Promise.resolve({
      state: 'ready' as const,
      provider: 'maximal' as const,
      model: model.model,
      modelKey: model.key,
      models: [{ ...model, efforts: [...model.efforts] }],
      effort,
    }));
    await renderOverlay(fake.transport);

    expect(byTestId('overlay-effort').classList).toContain('maximal-button');
    expect(byTestId('overlay-effort').classList).toContain('mh-select-trigger');
    act(() => {
      byTestId('overlay-effort').click();
    });
    act(() => {
      byTestId('menu-max').click();
    });
    await settle();

    expect(fake.transport.selectEffort).toHaveBeenCalledWith('max');
    expect(byTestId('overlay-card')).toBeTruthy();
  });

  it('keeps the card mounted while changing tool permissions', async () => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);

    act(() => {
      byTestId('overlay-permissions').click();
    });
    expect(byTestId('overlay-card')).toBeTruthy();
    expect(byTestId('overlay-permissions-menu')).toBeTruthy();

    act(() => {
      byTestId('menu-none').click();
    });
    await settle();

    expect(fake.transport.updatePreferences).toHaveBeenCalledWith({
      approval: 'none',
    });
    expect(byTestId('overlay-permissions').textContent).toContain('Automatically approve');
    expect(byTestId('overlay-card')).toBeTruthy();
  });

  it('cycles permissions with Command+Tab and shows the selected icon', async () => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);

    act(() => {
      keyDown(byTestId('overlay-input'), 'Tab', false, true);
    });
    await settle();

    expect(fake.transport.updatePreferences).toHaveBeenCalledWith({
      approval: 'none',
    });
    expect(byTestId('overlay-permissions').textContent).toContain('Automatically approve');
    expect(byTestId('overlay-permissions').querySelector('.mh-permission-icon')).toBeTruthy();
  });

  it('confirms before opening a populated conversation in the terminal', async () => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);

    expect((byTestId('overlay-open-terminal') as HTMLButtonElement).disabled).toBe(true);
    expect(byTestId('overlay-open-terminal').previousElementSibling).toBe(
      byTestId('overlay-attach'),
    );
    act(() => {
      inputText('Explain this');
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    await settle();

    expect(byTestId('overlay-open-terminal')).toBeTruthy();
    expect((byTestId('overlay-open-terminal') as HTMLButtonElement).disabled).toBe(true);
    expect(document.body.querySelector('.mh-open-terminal')).toBeNull();
    act(() => {
      fake.delta.emit({
        runId: fake.runId(),
        text: 'A terminal-ready response',
      });
    });
    expect((byTestId('overlay-open-terminal') as HTMLButtonElement).disabled).toBe(false);
    act(() => click('overlay-open-terminal'));
    expect(fake.transport.chats.terminal).not.toHaveBeenCalled();
    expect(byTestId('overlay-terminal-confirmation')).toBeTruthy();

    act(() => click('overlay-terminal-cancel'));
    expect(document.body.querySelector('[data-testid="overlay-terminal-confirmation"]')).toBeNull();
    expect(fake.transport.chats.terminal).not.toHaveBeenCalled();

    act(() => click('overlay-open-terminal'));
    act(() => click('overlay-terminal-confirm'));
    await settle();

    expect(fake.transport.chats.terminal).toHaveBeenCalledWith('chat-1', 80, 24);
    act(finishCardAnimation);
    expect(fake.transport.hide).toHaveBeenCalledTimes(1);
  });

  it.each(['/terminal', '!'])(
    'treats a bare %s command as a terminal handoff',
    async (command) => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);

    act(() => {
      inputText('Start a conversation');
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    await settle();
    act(() => {
      inputText(command);
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    await settle();

    expect(fake.transport.ask).toHaveBeenCalledTimes(1);
    expect(fake.transport.chats.terminal).toHaveBeenCalledWith('chat-1', 80, 24);
    act(finishCardAnimation);
    expect(fake.transport.hide).toHaveBeenCalledTimes(1);
    },
  );

  it.each(['/exit', '/quit'])('treats %s as an overlay exit command', async (command) => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);

    act(() => {
      inputText(command);
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    await settle();

    expect(fake.transport.hide).not.toHaveBeenCalled();
    act(finishCardAnimation);
    expect(fake.transport.hide).toHaveBeenCalledTimes(1);
    expect(fake.transport.ask).not.toHaveBeenCalled();
    expect(fake.transport.chats.terminal).not.toHaveBeenCalled();
  });

  it('handles Escape in order: abort, clear a draft, then dismiss', async () => {
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
    expect(byTestId('overlay-stop')).toBeInstanceOf(HTMLButtonElement);
    act(() => fake.end.emit({ runId: fake.runId(), result: { ok: true } }));

    act(() => {
      inputText('clear me');
      keyDown(document, 'Escape');
    });
    expect((byTestId('overlay-input') as HTMLTextAreaElement).value).toBe('');
    expect(fake.transport.hide).not.toHaveBeenCalled();

    act(() => {
      keyDown(document, 'Escape');
    });
    expect(fake.transport.hide).not.toHaveBeenCalled();
    act(finishCardAnimation);
    expect(fake.transport.hide).toHaveBeenCalledTimes(1);
  });

  it('animates main-process dismissal requests before hiding once', async () => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);

    act(() => fake.dismissRequested.emit(undefined));
    expect(byTestId('overlay-card').classList).toContain('mh-card--exiting');
    expect(fake.transport.hide).not.toHaveBeenCalled();

    act(() => fake.dismissRequested.emit(undefined));
    act(finishCardAnimation);
    act(finishCardAnimation);
    expect(fake.transport.hide).toHaveBeenCalledTimes(1);
  });

  it('restarts entrance and focuses the prompt when shown again', async () => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);
    act(finishCardAnimation);
    const input = byTestId('overlay-input');
    input.blur();

    act(() => fake.shown.emit(undefined));
    expect(byTestId('overlay-card').classList).toContain('mh-card--entering');
    expect(document.activeElement).toBe(input);
  });

  it('dismisses immediately when reduced motion is preferred', async () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({
      matches: true,
      media: '(prefers-reduced-motion: reduce)',
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })));
    const fake = fakeTransport();
    await renderOverlay(fake.transport);

    act(() => fake.dismissRequested.emit(undefined));
    expect(fake.transport.hide).toHaveBeenCalledTimes(1);
  });

  it('supports Allow and Skip pills with Command+Enter and Escape shortcuts', async () => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);

    act(() => fake.approval.emit({
      runId: 'fixture-run',
      id: 'approval-1',
      tool: 'write',
      summary: '/tmp/file',
    }));
    expect(byTestId('overlay-approval-summary').textContent).toBe('/tmp/file');
    expect(byTestId('overlay-status').textContent).toBe('Waiting for you to approve write');
    act(() => click('overlay-allow'));
    await settle();
    expect(fake.transport.approve).toHaveBeenLastCalledWith({
      runId: 'fixture-run',
      id: 'approval-1',
      allow: true,
      remember: false,
    });

    act(() => {
      inputText('do not send this');
      fake.approval.emit({
        runId: 'fixture-run',
        id: 'approval-2',
        tool: 'bash',
        summary: 'pwd',
      });
    });
    act(() => {
      keyDown(byTestId('overlay-input'), 'Enter');
    });
    expect(fake.transport.approve).toHaveBeenCalledTimes(1);
    act(() => {
      keyDown(byTestId('overlay-input'), 'Enter', false, true);
    });
    await settle();

    expect(fake.transport.approve).toHaveBeenLastCalledWith({
      runId: 'fixture-run',
      id: 'approval-2',
      allow: true,
      remember: false,
    });
    expect(fake.transport.ask).not.toHaveBeenCalled();

    act(() => fake.approval.emit({
      runId: 'fixture-run',
      id: 'approval-3',
      tool: 'edit',
      summary: 'notes.txt',
    }));
    act(() => {
      keyDown(document, 'Escape');
    });
    await settle();
    expect(fake.transport.approve).toHaveBeenLastCalledWith({
      runId: 'fixture-run',
      id: 'approval-3',
      allow: false,
      remember: false,
    });
  });

  it('starts a model download, reports progress, and re-probes when ready', async () => {
    const fake = fakeTransport({ state: 'needs-model', model: 'coder.gguf', approxMb: 4000 });
    let finishDownload!: (progress: ModelDownloadProgress) => void;
    vi.mocked(fake.transport.ensureModel).mockReturnValue(new Promise((resolve) => {
      finishDownload = resolve;
    }));
    await renderOverlay(fake.transport);

    expect(byTestId('overlay-setup').textContent).toContain('About 4000 MB');
    act(() => click('overlay-download-start'));
    expect(fake.transport.ensureModel).toHaveBeenCalledTimes(1);
    const request = vi.mocked(fake.transport.ensureModel).mock.calls[0]?.[0];
    if (!request) throw new Error('Missing model download request');
    expect(request).toEqual({
      downloadId: 'download-1',
      model: 'coder.gguf',
    });
    expect(byTestId('overlay-download').textContent).toContain('Starting…');

    act(() => fake.modelProgress.emit({
      ...request,
      downloadId: 'stale-download',
      progress: {
        state: 'downloading',
        received: 3_000_000,
        total: 4_000_000,
      },
    }));
    expect(byTestId('overlay-download').textContent).toContain('Starting…');

    act(() => fake.modelProgress.emit({
      ...request,
      progress: {
        state: 'downloading',
        received: 1_000_000,
        total: 4_000_000,
      },
    }));
    expect(byTestId('overlay-download').textContent).toContain('1 MB of 4 MB');
    expect(document.body.querySelector<HTMLElement>('.mh-setup__bar')?.style.width).toBe('25%');

    fake.setStatus({
      state: 'ready',
      provider: 'ollama',
      model: 'coder',
      modelKey: 'ollama:coder',
      models: [
        {
          key: 'ollama:coder',
          label: 'coder',
          model: 'coder',
          provider: 'ollama',
          description: 'Local model via Ollama',
          efforts: [],
        },
      ],
    });
    act(() => fake.modelProgress.emit({
      ...request,
      progress: { state: 'ready' },
    }));
    await settle();
    expect(fake.transport.provider).toHaveBeenCalledTimes(2);
    expect(byTestId('overlay-status').textContent).toBe('');

    act(() => finishDownload({ ...request, progress: { state: 'ready' } }));
    await settle();
  });

  it('re-probes when model readiness arrives only in the correlated response', async () => {
    const fake = fakeTransport({
      state: 'needs-model',
      model: 'coder.gguf',
      approxMb: 4000,
    });
    await renderOverlay(fake.transport);
    fake.setStatus({
      state: 'ready',
      provider: 'embedded',
      model: 'coder',
      modelKey: 'embedded:coder.gguf',
      models: [],
    });

    act(() => click('overlay-download-start'));
    await settle();

    expect(fake.transport.provider).toHaveBeenCalledTimes(2);
    expect(byTestId('overlay-status').textContent).toBe('');
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
