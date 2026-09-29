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
  it('keeps initials beneath the remote image layer', () => {
    const surface = renderAvatar('https://avatars.githubusercontent.com/u/1?v=4');
    expect(surface.querySelector('img')).toBeNull();
    expect(surface.querySelector('[data-testid="avatar-initials"]')?.textContent)
      .toBe('B');
    expect(
      surface.querySelector<HTMLElement>('.avatar__image')?.style.backgroundImage,
    ).toContain('https://avatars.githubusercontent.com/u/1?v=4');
  });

  it('updates the image layer when the avatar URL changes', () => {
    const surface = renderAvatar('https://avatars.githubusercontent.com/u/1?v=4');

    act(() => {
      root?.render(
        <Avatar
          account={{
            id: 'bstucker_microsoft',
            displayName: 'bstucker_microsoft',
            avatarUrl: 'https://avatars.githubusercontent.com/u/2?v=4',
          }}
        />,
      );
    });

    expect(
      surface.querySelector<HTMLElement>('.avatar__image')?.style.backgroundImage,
    ).toContain('https://avatars.githubusercontent.com/u/2?v=4');
  });
});
