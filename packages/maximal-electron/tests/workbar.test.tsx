// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { SHELL_ICON_NAMES, Workbar } from '../src/renderer/index.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

describe('Workbar', () => {
  it('renders the package-owned icon vocabulary and selects an item', () => {
    const onSelect = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <Workbar
          items={[
            { id: 'map', label: 'Workspace map', icon: 'map' },
            { id: 'terminal:one', label: 'Terminal', icon: 'terminal' },
          ]}
          current="map"
          onSelect={onSelect}
          account={{ id: 'octocat', displayName: 'Octocat', handle: '@octocat' }}
          onOpenProfileSurface={vi.fn()}
          onToggleSettings={vi.fn()}
        />,
      );
    });

    expect(SHELL_ICON_NAMES).toEqual([
      'browser',
      'document',
      'folder',
      'map',
      'settings',
      'terminal',
    ]);
    expect(container.querySelectorAll('.workbar__main svg.lucide')).toHaveLength(2);
    expect(container.querySelector('[data-testid="profile"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="toggle-settings"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="workbar-map"]')?.getAttribute('aria-current'))
      .toBe('true');

    const terminal = container.querySelector<HTMLButtonElement>(
      '[data-testid="workbar-terminal-one"]',
    );
    if (terminal === null) throw new Error('Terminal workbar item was not rendered');
    act(() => terminal.click());
    expect(onSelect).toHaveBeenCalledWith('terminal:one');
  });

  it('keeps profile and settings at the bottom and forwards their actions', async () => {
    const onOpenProfileSurface = vi.fn();
    const onToggleSettings = vi.fn();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);

    act(() => {
      root?.render(
        <Workbar
          items={[{ id: 'map', label: 'Workspace map', icon: 'map' }]}
          current="map"
          onSelect={vi.fn()}
          account={{ id: 'octocat', displayName: 'Octocat', handle: '@octocat' }}
          onOpenProfileSurface={onOpenProfileSurface}
          settingsOpen
          onToggleSettings={onToggleSettings}
        />,
      );
    });

    const bottom = container.querySelector('.workbar__bottom');
    const profile = container.querySelector<HTMLElement>('[data-testid="profile"]');
    const settings = container.querySelector<HTMLButtonElement>('[data-testid="toggle-settings"]');
    expect(bottom?.firstElementChild).toBe(profile);
    expect(bottom?.lastElementChild).toBe(settings);
    expect(settings?.getAttribute('data-active')).toBe('true');

    if (profile === null) throw new Error('Profile button was not rendered');
    await act(async () => {
      profile.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, button: 0 }));
    });
    const diagnostics = document.querySelector<HTMLElement>('[data-testid="menu-diagnostics"]');
    if (diagnostics === null) throw new Error('Diagnostics profile action was not rendered');
    await act(async () => diagnostics.click());
    expect(onOpenProfileSurface).toHaveBeenCalledWith('diagnostics');

    act(() => settings?.click());
    expect(onToggleSettings).toHaveBeenCalledOnce();
  });
});
