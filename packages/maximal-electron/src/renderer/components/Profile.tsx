import {
  ChartColumn,
  Cpu,
  KeyRound,
  LogOut,
  ScrollText,
  ToggleLeft,
  UserRound,
} from 'lucide-react';
import {
  Avatar as DesignSystemAvatar,
  MenuGroup,
  MenuItem,
  MenuItemContent,
  MenuRoot,
} from '@maximal/maximal-design-system/components';
import { IconButton } from '@maximal/maximal-design-system/primitives';
import type { ComponentType } from 'react';

import { initials, profileLabel, type Account } from '../lib/account.js';
import type { SettingsSurface } from '../lib/settings.js';

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
export function Avatar({ account }: { account?: Account }) {
  return (
    <DesignSystemAvatar
      alt=""
      data-testid={account === undefined ? 'avatar-anon' : 'avatar-initials'}
      fallback={
        account === undefined
          ? <UserRound aria-hidden size={14} />
          : initials(account.displayName)
      }
      src={account?.avatarUrl}
    />
  );
}

/** The account menu and its title-bar trigger. */
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
  const identity = (
    <MenuItemContent
      description={account?.handle}
      leading={<Avatar account={account} />}
      trailing={account?.plan}
    >
      {account?.displayName ?? 'Not signed in'}
    </MenuItemContent>
  );
  const items = (
    <>
      {SURFACES.map((surface) => {
        const Icon = surface.icon;
        return (
          <MenuItem
            data-testid={`menu-${surface.id}`}
            key={surface.id}
            leading={<Icon aria-hidden size={16} />}
            onClick={() => onOpen(surface.id)}
          >
            {surface.label}
          </MenuItem>
        );
      })}
      {account !== undefined && onSignOut ? (
        <MenuItem
          data-testid="menu-sign-out"
          leading={<LogOut aria-hidden size={16} />}
          onClick={onSignOut}
        >
          Sign out
        </MenuItem>
      ) : null}
    </>
  );

  return (
    <MenuRoot
      align="end"
      popupProps={{ 'data-testid': `${testId}-menu` }}
      sideOffset={6}
      trigger={
        <IconButton data-testid={testId} label={profileLabel(account)}>
          <Avatar account={account} />
        </IconButton>
      }
    >
      {account === undefined && onSignIn !== undefined ? (
        <>
          <MenuItem
            leading={<Avatar account={account} />}
            onClick={onSignIn}
          >
            Not signed in
          </MenuItem>
          {items}
        </>
      ) : (
        <MenuGroup label={identity}>{items}</MenuGroup>
      )}
    </MenuRoot>
  );
}
