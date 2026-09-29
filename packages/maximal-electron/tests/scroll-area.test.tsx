// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ScrollArea } from '../src/renderer/components/controls/ScrollArea.js';

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  vi.useFakeTimers();
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.useRealTimers();
});

describe('ScrollArea', () => {
  it('is keyboard focusable and supports navigation semantics', async () => {
    await act(async () => {
      root.render(<ScrollArea as="nav" aria-label="Sections">Content</ScrollArea>);
    });

    const area = container.querySelector('nav');
    expect(area?.classList.contains('scroll-area')).toBe(true);
    expect(area?.tabIndex).toBe(0);
    expect(area?.getAttribute('aria-label')).toBe('Sections');
  });

  it('keeps the scrollbar visible until 800ms after the last scroll event', async () => {
    const onScroll = vi.fn();
    await act(async () => {
      root.render(<ScrollArea onScroll={onScroll}>Content</ScrollArea>);
    });
    const area = container.querySelector<HTMLElement>('.scroll-area');
    if (!area) throw new Error('scroll area did not render');

    await act(async () => area.dispatchEvent(new Event('scroll', { bubbles: true })));
    expect(area.dataset.scrollbarVisible).toBe('true');
    expect(onScroll).toHaveBeenCalledOnce();

    await act(async () => vi.advanceTimersByTime(799));
    expect(area.dataset.scrollbarVisible).toBe('true');

    await act(async () => area.dispatchEvent(new Event('scroll', { bubbles: true })));
    await act(async () => vi.advanceTimersByTime(799));
    expect(area.dataset.scrollbarVisible).toBe('true');

    await act(async () => vi.advanceTimersByTime(1));
    expect(area.dataset.scrollbarVisible).toBeUndefined();
  });
});
