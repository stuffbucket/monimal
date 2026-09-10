// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { TabBar } from '../src/renderer/components/TabBar.js';
import {
  encodeTabTransfer,
  TAB_TRANSFER_MIME,
  type TabTransfer,
} from '../src/renderer/lib/tab-transfer.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class TransferData {
  dropEffect = 'none';
  effectAllowed = 'uninitialized';
  private readonly values = new Map<string, string>();

  get types(): string[] {
    return [...this.values.keys()];
  }

  getData(type: string): string {
    return this.values.get(type) ?? '';
  }

  setData(type: string, value: string): void {
    this.values.set(type, value);
  }
}

function dragEvent(type: string, dataTransfer: TransferData, coordinates = {}) {
  const event = new Event(type, { bubbles: true, cancelable: true });
  Object.assign(event, { dataTransfer, clientX: 20, clientY: 20, screenX: 120, screenY: 220 }, coordinates);
  return event;
}

async function renderStrip(transfer: React.ComponentProps<typeof TabBar>['transfer']) {
  const element = document.createElement('div');
  element.className = 'sb-shell';
  document.body.append(element);
  const root = createRoot(element);
  await act(async () => {
    root.render(
      <TabBar
        tabIdBase="test"
        tabs={[{ id: 'one', title: 'One' }, { id: 'two', title: 'Two' }]}
        active="one"
        onSelect={() => undefined}
        transfer={transfer}
      />,
    );
  });
  return { element, root };
}

afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});

describe('tab drag gestures', () => {
  it('writes identity on drag and reports a same-frame move before the drop target', async () => {
    const onMoveTab = vi.fn();
    const { element, root } = await renderStrip({ frameId: 'main', onMoveTab });
    const [one, two] = element.querySelectorAll('[role="tab"]');
    const data = new TransferData();

    await act(async () => {
      one!.dispatchEvent(dragEvent('dragstart', data));
      two!.dispatchEvent(dragEvent('dragover', data));
      two!.dispatchEvent(dragEvent('drop', data));
    });

    expect(data.effectAllowed).toBe('move');
    expect(data.dropEffect).toBe('move');
    expect(data.getData(TAB_TRANSFER_MIME)).toBe(encodeTabTransfer({
      version: 1,
      sourceFrameId: 'main',
      tabId: 'one',
    }));
    expect(onMoveTab).toHaveBeenCalledWith('one', 'two');
    await act(async () => root.unmount());
  });

  it('reports a transfer received from another frame', async () => {
    const onReceiveTab = vi.fn();
    const { element, root } = await renderStrip({ frameId: 'main', onReceiveTab });
    const target = element.querySelectorAll('[role="tab"]')[0]!;
    const data = new TransferData();
    const payload: TabTransfer = { version: 1, sourceFrameId: 'standalone', tabId: 'term' };
    data.setData(TAB_TRANSFER_MIME, encodeTabTransfer(payload));

    await act(async () => target.dispatchEvent(dragEvent('drop', data)));

    expect(onReceiveTab).toHaveBeenCalledWith(payload, 'one');
    await act(async () => root.unmount());
  });

  it('reports an unaccepted drag released outside the shell as a detach', async () => {
    const onDetachTab = vi.fn();
    const { element, root } = await renderStrip({ frameId: 'main', onDetachTab });
    const source = element.querySelector('[role="tab"]')!;
    const data = new TransferData();
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => null,
    });

    await act(async () => source.dispatchEvent(dragEvent('dragend', data)));

    expect(onDetachTab).toHaveBeenCalledWith(
      { version: 1, sourceFrameId: 'main', tabId: 'one' },
      { screenX: 120, screenY: 220 },
    );
    await act(async () => root.unmount());
  });

  it('does not detach a canceled drag while it remains over the shell', async () => {
    const onDetachTab = vi.fn();
    const { element, root } = await renderStrip({ frameId: 'main', onDetachTab });
    const source = element.querySelector('[role="tab"]')!;
    Object.defineProperty(document, 'elementFromPoint', {
      configurable: true,
      value: () => source,
    });

    await act(async () => source.dispatchEvent(dragEvent('dragend', new TransferData())));

    expect(onDetachTab).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });

  it('does not claim a cross-frame drop without a receive callback', async () => {
    const { element, root } = await renderStrip({ frameId: 'main' });
    const target = element.querySelector('[role="tab"]')!;
    const data = new TransferData();
    data.setData(TAB_TRANSFER_MIME, encodeTabTransfer({
      version: 1,
      sourceFrameId: 'standalone',
      tabId: 'term',
    }));
    const event = dragEvent('drop', data);

    await act(async () => target.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(false);
    expect(data.dropEffect).toBe('none');
    await act(async () => root.unmount());
  });

  it('does not claim a drop target rejected by consumer policy', async () => {
    const onMoveTab = vi.fn();
    const { element, root } = await renderStrip({
      frameId: 'main',
      canDropBefore: (tab) => tab?.id !== 'one',
      onMoveTab,
    });
    const target = element.querySelector('[role="tab"]')!;
    const data = new TransferData();
    data.setData(TAB_TRANSFER_MIME, encodeTabTransfer({
      version: 1,
      sourceFrameId: 'main',
      tabId: 'two',
    }));
    const event = dragEvent('drop', data);

    await act(async () => target.dispatchEvent(event));

    expect(event.defaultPrevented).toBe(false);
    expect(onMoveTab).not.toHaveBeenCalled();
    await act(async () => root.unmount());
  });
});