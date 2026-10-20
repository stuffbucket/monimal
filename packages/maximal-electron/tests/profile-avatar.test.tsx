// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it } from 'vitest';

import { Avatar } from '../src/renderer/components/Profile.js';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

let root: Root | undefined;
let container: HTMLDivElement | undefined;

afterEach(() => {
  if (root) act(() => root?.unmount());
  container?.remove();
  root = undefined;
  container = undefined;
});

function renderAvatar(avatarUrl: string): HTMLDivElement {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root?.render(
      <Avatar
        account={{
          id: 'bstucker_microsoft',
          displayName: 'bstucker_microsoft',
          avatarUrl,
        }}
      />,
    );
  });
  return container;
}

describe('Profile Avatar', () => {
  it('uses the design-system avatar with initials while the image loads', () => {
    const surface = renderAvatar('https://avatars.githubusercontent.com/u/1?v=4');
    const avatar = surface.querySelector('[data-testid="avatar-initials"]');
    expect(avatar?.classList.contains('maximal-avatar')).toBe(true);
    expect(avatar?.textContent).toBe('B');
  });

  it('keeps an anonymous design-system fallback for signed-out accounts', () => {
    const surface = renderAvatar('');
    act(() => {
      root?.render(<Avatar />);
    });
    const avatar = surface.querySelector('[data-testid="avatar-anon"]');
    expect(avatar?.classList.contains('maximal-avatar')).toBe(true);
    expect(avatar?.querySelector('svg')).not.toBeNull();
  });
});
