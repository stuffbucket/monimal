import {
  ChartColumn,
  Cpu,
  KeyRound,
  LogIn,
  LogOut,
  ScrollText,
  ToggleLeft,
  UserRound,
} from 'lucide-react';
import type { ComponentType } from 'react';

import { initials, profileLabel, type Account } from '../lib/account.js';
import type { SettingsSurface } from '../lib/settings.js';

import { IconButton } from './controls/Button.js';
import { Menu, type MenuItem } from './controls/Overlays.js';

/**
 * The account control in the title bar.
 *
 * The shell owns this surface and none of the account model. `account` is a
 * plain value the consumer already has; sign-in and sign-out are callbacks it
 * already implements. Nothing here knows what an identity provider is, which
 * is the same contract `lib/data.ts` states for content and `tokens.css` for
 * the palette.
 *
 * What the shell does own is the settings the menu reaches. Those are its own
 * surfaces, so it names them.
 */

interface SurfaceEntry {
  id: SettingsSurface;
  label: string;
  icon: ComponentType<{ size?: number }>;
}

/**
 * The menu, in order.
 *
 * Model cards, keys and toggles configure what the application talks to;
 * diagnostics and usage report on what it did. The two groups are ordered that
 * way rather than alphabetically.
 */
const SURFACES: SurfaceEntry[] = [
  { id: 'model-cards', label: 'Model cards', icon: Cpu },
  { id: 'api-keys', label: 'API keys', icon: KeyRound },
  { id: 'app-toggles', label: 'Apps', icon: ToggleLeft },
  { id: 'diagnostics', label: 'Logs and diagnostics', icon: ScrollText },
  { id: 'usage', label: 'Usage dashboard', icon: ChartColumn },
];

/**
 * The picture, or two letters, or nobody.
 *
 * `alt` is empty on purpose. The button that holds this already carries the
 * account name, and a second announcement of it is noise.
 */
export function Avatar({ account, large }: { account?: Account; large?: boolean }) {
  const className = `avatar${large ? ' avatar--lg' : ''}`;

  if (account === undefined) {
    return (
      <span className={`${className} avatar--anon`} data-testid="avatar-anon">
        <UserRound size={large ? 18 : 14} />
      </span>
    );
  }

  if (account.avatarUrl !== undefined) {
    return <img className={className} src={account.avatarUrl} alt="" />;
  }

  return (
    <span className={`${className} avatar--initials`} data-testid="avatar-initials">
      {initials(account.displayName)}
    </span>
  );
}

export function Profile({
  account,
  onOpen,
  onSignIn,
  onSignOut,
  testId = 'profile',
}: {
  /** Undefined means signed out. */
  account?: Account;
  /** Opens a settings surface. Where it opens is the consumer's decision. */
  onOpen: (surface: SettingsSurface) => void;
  /** Omitted when the consumer has no sign-in to offer. */
  onSignIn?: () => void;
  /** Omitted when the consumer has no sign-out to offer. */
  onSignOut?: () => void;
  testId?: string;
}) {
  const items: MenuItem[] = SURFACES.map((surface) => ({
    id: surface.id,
    label: surface.label,
    icon: surface.icon,
    onSelect: () => {
      onOpen(surface.id);
    },
  }));

  // Absent means the consumer has no such action, so no entry. A disabled one
  // would advertise a sign-in that is never coming.
  if (account === undefined && onSignIn) {
    items.push({ id: 'sign-in', label: 'Sign in', icon: LogIn, onSelect: onSignIn });
  }
  if (account !== undefined && onSignOut) {
    items.push({
      id: 'sign-out',
      label: 'Sign out',
      icon: LogOut,
      danger: true,
      onSelect: onSignOut,
    });
  }

  return (
    <Menu
      align="end"
      testId={`${testId}-menu`}
      trigger={
        <IconButton label={profileLabel(account)} testId={testId}>
          <Avatar account={account} />
        </IconButton>
      }
      header={
        <span className="profile__identity">
          <Avatar account={account} large />
          <span className="profile__lines">
            <span className="profile__name">
              {account?.displayName ?? 'Not signed in'}
            </span>
            {account?.handle !== undefined && (
              <span className="profile__handle">{account.handle}</span>
            )}
          </span>
          {account?.plan !== undefined && (
            <span className="profile__plan">{account.plan}</span>
          )}
        </span>
      }
      items={items}
    />
  );
}
