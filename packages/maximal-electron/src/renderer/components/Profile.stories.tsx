import type { Meta, StoryObj } from '@storybook/react-vite';
import { expect, userEvent, within } from 'storybook/test';

import type { Account } from '../lib/account.js';

import { Profile } from './Profile.js';

/**
 * The account control, in every state a consumer can put it in.
 *
 * The avatar is a data URI rather than a URL, so these stories render the same
 * on a machine with no network.
 */
const PORTRAIT =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
       <rect width="32" height="32" fill="#7c5cff"/>
       <circle cx="16" cy="12" r="6" fill="#ffd9a0"/>
       <circle cx="16" cy="30" r="11" fill="#ffd9a0"/>
     </svg>`,
  );

const ADA: Account = {
  id: 'user-1',
  displayName: 'Ada Lovelace',
  handle: 'ada@example.com',
  avatarUrl: PORTRAIT,
  plan: 'Pro',
};

const meta = {
  title: 'Layout/Profile',
  component: Profile,
  args: {
    account: ADA,
    onOpen: () => undefined,
    onSignIn: () => undefined,
    onSignOut: () => undefined,
  },
} satisfies Meta<typeof Profile>;

export default meta;
type Story = StoryObj<typeof meta>;

export const SignedIn: Story = {};

/** No `avatarUrl`, so the name supplies two letters instead. */
export const NoAvatar: Story = {
  name: 'Missing avatar',
  args: { account: { ...ADA, avatarUrl: undefined } },
};

/** The control stays, because signing in is the thing it is there to offer. */
export const SignedOut: Story = {
  args: { account: undefined },
};

/**
 * A name with no natural bound.
 *
 * The popup is as wide as its widest child, so without the cap in
 * `.profile__identity` one account would decide the width of the menu.
 */
export const LongDisplayName: Story = {
  name: 'Long display name',
  args: {
    account: {
      ...ADA,
      avatarUrl: undefined,
      displayName: 'Augusta Ada King-Noel, Countess of Lovelace',
      handle: 'augusta.ada.king-noel@analytical-engine.example.com',
      plan: 'Enterprise',
    },
  },
};

/**
 * The menu itself, and what it reaches.
 *
 * Closed again at the end. An open Radix popup marks the rest of the document
 * `aria-hidden`, and `npm run storybook:check` runs axe over whatever the play
 * function leaves behind.
 */
export const MenuEntries: Story = {
  name: 'Menu',
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole('button', { name: 'Account: Ada Lovelace' }));

    const menu = await within(document.body).findByTestId('profile-menu');
    for (const label of [
      'Model cards',
      'API keys',
      'Apps',
      'Logs and diagnostics',
      'Usage dashboard',
      'Sign out',
    ]) {
      await expect(within(menu).getByText(label)).toBeInTheDocument();
    }

    // The caption is a label, not an item, so arrow keys never land on it.
    await expect(within(menu).getByText('ada@example.com')).toBeInTheDocument();
    await expect(within(menu).queryAllByRole('menuitem')).toHaveLength(6);

    await userEvent.keyboard('{Escape}');
    await expect(
      within(document.body).queryByTestId('profile-menu'),
    ).not.toBeInTheDocument();
  },
};

/** Signed out, the last entry is a way in rather than a way out. */
export const SignedOutMenu: Story = {
  name: 'Menu — signed out',
  args: { account: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Account: not signed in' }),
    );

    const menu = await within(document.body).findByTestId('profile-menu');
    await expect(within(menu).getByText('Not signed in')).toBeInTheDocument();
    await expect(within(menu).getByText('Sign in')).toBeInTheDocument();
    await expect(within(menu).queryByText('Sign out')).not.toBeInTheDocument();

    await userEvent.keyboard('{Escape}');
  },
};

/** With no sign-in to offer, the entry is absent rather than disabled. */
export const NoAuthActions: Story = {
  name: 'Menu — no sign-in offered',
  args: { account: undefined, onSignIn: undefined, onSignOut: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(
      canvas.getByRole('button', { name: 'Account: not signed in' }),
    );

    const menu = await within(document.body).findByTestId('profile-menu');
    await expect(within(menu).queryAllByRole('menuitem')).toHaveLength(5);

    await userEvent.keyboard('{Escape}');
  },
};
