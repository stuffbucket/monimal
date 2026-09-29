// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type {
  AgentApprovalRequest,
  AgentEffort,
  AgentEnd,
  AgentToolEvent,
  AssistantOverlayPreferences,
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
  const delta = channel<string>();
  const tool = channel<AgentToolEvent>();
  const approval = channel<AgentApprovalRequest>();
  const end = channel<AgentEnd>();
  const modelProgress = channel<ModelProgress>();
  const preferences = channel<AssistantOverlayPreferences>();
  const chatSelected = channel<string>();
  const transport: HarnessTransport = {
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
    ask: vi.fn(() => Promise.resolve({
      started: true as const,
      chatId: 'chat-1',
    })),
    abort: vi.fn(() => Promise.resolve()),
    approve: vi.fn(() => Promise.resolve()),
    ensureModel: vi.fn(() => Promise.resolve({ state: 'ready' as const })),
    preferences: vi.fn(() => Promise.resolve({
      candy: true,
      approval: 'writes' as const,
      hotkey: 'CommandOrControl+Shift+Space',
    })),
    updatePreferences: vi.fn((
      update: Partial<Pick<AssistantOverlayPreferences, 'candy' | 'approval'>>,
    ) => Promise.resolve({
      candy: update.candy ?? true,
      approval: update.approval ?? 'writes',
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
    },
    onDelta: delta.subscribe,
    onTool: tool.subscribe,
    onApproval: approval.subscribe,
    onEnd: end.subscribe,
    onModelProgress: modelProgress.subscribe,
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

    expect(fake.transport.ask).toHaveBeenCalledWith('explain this', undefined);
    expect((byTestId('overlay-input') as HTMLTextAreaElement).value).toBe('');
    expect(byTestId('overlay-status').textContent).toBe('Thinking…');

    act(() => {
      fake.delta.emit('Hello');
      fake.delta.emit(' world');
      fake.tool.emit({ id: 'tool-1', name: 'read', phase: 'start' });
    });
    expect(byTestId('overlay-answer').textContent).toContain('Hello world');
    expect(byTestId('overlay-status').textContent).toBe('Running read…');
    expect(byTestId('overlay-tools').textContent).toContain('readrunning');

    act(() => fake.tool.emit({ id: 'tool-1', name: 'read', phase: 'end' }));
    expect(byTestId('overlay-status').textContent).toBe('Thinking…');
    expect(byTestId('overlay-tools').textContent).toContain('readcomplete');

    act(() => fake.end.emit({ ok: false, error: 'Model stopped' }));
    expect(byTestId('overlay-answer').textContent).toContain('Hello worldModel stopped');
    expect(byTestId('overlay-status').textContent).toBe('embedded · local-model');
  });

  it('opens and focuses the model picker when the preference is unavailable', async () => {
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

    act(() => {
      keyDown(picker, 'Enter');
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

  it('changes reasoning effort without dismissing the card', async () => {
    const model = {
      key: 'maximal:claude',
      label: 'Claude',
      model: 'claude',
      provider: 'maximal' as const,
      description: 'Extended reasoning · 200K context',
      efforts: ['low', 'medium', 'high'] as const,
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

    act(() => {
      keyDown(byTestId('overlay-effort'), 'Enter');
    });
    act(() => {
      byTestId('menu-high').click();
    });
    await settle();

    expect(fake.transport.selectEffort).toHaveBeenCalledWith('high');
    expect(byTestId('overlay-card')).toBeTruthy();
  });

  it('keeps the card mounted while changing tool permissions', async () => {
    const fake = fakeTransport();
    await renderOverlay(fake.transport);

    act(() => {
      keyDown(byTestId('overlay-permissions'), 'Enter');
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
    expect(byTestId('overlay-card')).toBeTruthy();
  });

  it('aborts before dismissing', async () => {
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
