import { Settings } from 'lucide-react';
import { TooltipProvider } from '@radix-ui/react-tooltip';
import type { ReactElement } from 'react';

import type { Account } from '../lib/account.js';
import { shellIcon, type ShellIconName } from '../lib/shell-icons.js';
import type { SettingsSurface } from '../lib/settings.js';

import { Profile } from './Profile.js';
import { IconButton } from './controls/Button.js';

export interface WorkbarItem<Id extends string> {
  id: Id;
  label: string;
  icon: ShellIconName;
}

/** Persistent icon-only navigation for switching workspace surfaces. */
export function Workbar<Id extends string>({
  items,
  current,
  onSelect,
  account,
  onOpenProfileSurface,
  onSignIn,
  onSignOut,
  settingsOpen = false,
  onToggleSettings,
  label = 'Workspace views',
  testId = 'workbar',
}: {
  items: WorkbarItem<Id>[];
  current: Id;
  onSelect: (id: Id) => void;
  account?: Account;
  onOpenProfileSurface?: (surface: SettingsSurface) => void;
  onSignIn?: () => void;
  onSignOut?: () => void;
  settingsOpen?: boolean;
  onToggleSettings?: () => void;
  label?: string;
  testId?: string;
}): ReactElement {
  return (
    <TooltipProvider>
      <nav className="workbar" aria-label={label} data-testid={testId}>
        <div className="workbar__main">
          {items.map((item) => {
            const Icon = shellIcon(item.icon);
            return (
              <button
                key={item.id}
                type="button"
                className="workbar__item"
                aria-current={item.id === current}
                aria-label={item.label}
                title={item.label}
                onClick={() => onSelect(item.id)}
                data-testid={`workbar-${item.id.replace(':', '-')}`}
              >
                <Icon aria-hidden="true" />
              </button>
            );
          })}
        </div>
        {onOpenProfileSurface !== undefined || onToggleSettings !== undefined ? (
          <div className="workbar__bottom">
            {onOpenProfileSurface !== undefined ? (
              <Profile
                account={account}
                onOpen={onOpenProfileSurface}
                onSignIn={onSignIn}
                onSignOut={onSignOut}
              />
            ) : null}
            {onToggleSettings !== undefined ? (
              <IconButton
                label={settingsOpen ? 'Close Settings' : 'Open Settings'}
                active={settingsOpen}
                onClick={onToggleSettings}
                testId="toggle-settings"
              >
                <Settings aria-hidden="true" />
              </IconButton>
            ) : null}
          </div>
        ) : null}
      </nav>
    </TooltipProvider>
  );
}
