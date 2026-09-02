import { useComponentStyles } from '../../lib/component-styles.js';
import { TriangleAlert } from 'lucide-react';

import {
  APP_STATUS_LABELS,
  type AppIntegration,
} from '../../lib/settings.js';
import { Button } from '../controls/Button.js';
import { Switch } from '../controls/Fields.js';
import { Banner, EmptyState, Tag } from '../controls/Layout.js';
import { Dialog } from '../controls/Overlays.js';

import { CopyButton } from './CopyButton.js';
import { SETTINGS_STYLES } from './SettingsPage.js';

/**
 * The rules an application row draws itself with.
 *
 * They travel with the component so exporting one ships the other, and every
 * value is a token. `src/renderer/lib/component-styles.ts` says why.
 */
const APP_TOGGLES_STYLES = `
/*
 * A compound name, not '.app'.
 *
 * '.app' collided with the shell root, which carries the same bare class for
 * an unrelated reason ('shell.css''s own layout rule). Equal specificity and
 * 'controls.css' loading first through 'shell.css''s '@import' meant each side
 * won the properties the other did not redeclare: the shell root inherited
 * this card's 'padding', 'gap', 'border' and 'border-radius', and this card
 * inherited the shell root's 'display: flex'. Issue #184.
 */
.sb-shell .app-card {
  display: grid;
  gap: var(--shell-space-2);
  padding: var(--shell-space-3);
  border: 1px solid var(--shell-border-subtle);
  border-radius: var(--shell-radius-card);
}

.sb-shell .app-card__head {
  display: flex;
  align-items: center;
  gap: var(--shell-space-2);
}

.sb-shell .app-card__name {
  flex: 1;
  min-width: 0;
  font-size: var(--shell-text-base);
  font-weight: var(--shell-weight-md);
  color: var(--shell-text-primary);
}

.sb-shell .app-card__head .switch {
  width: auto;
  flex: none;
}

.sb-shell .app-card__path {
  margin: 0;
  font-family: var(--shell-font-mono);
  font-size: var(--shell-text-xs);
  color: var(--shell-text-muted);
  overflow-wrap: anywhere;
}

.sb-shell .app-card__install {
  display: grid;
  gap: var(--shell-space-2);
}

.sb-shell .app-card__command {
  display: block;
  padding: var(--shell-space-2);
  border-radius: var(--shell-radius-input);
  border: 1px solid var(--shell-border-input);
  background: var(--shell-bg-input);
  font-family: var(--shell-font-mono);
  font-size: var(--shell-text-xs);
  color: var(--shell-text-primary);
  overflow-wrap: anywhere;
}
`;

/**
 * Which applications route through this shell.
 *
 * A dialog rather than a tab. It is a short list of switches with one decision
 * each, and nothing on it rewards being left open: flip a switch and you are
 * done. The heavier surfaces — the catalogue, the report, the dashboard — are
 * tabs for the opposite reason.
 *
 * Three states carry over from the parked shell, and each one changes what the
 * card offers rather than only greying the switch:
 *
 *   - nothing installed, and a command that installs it. No switch, because
 *     there is nothing to route yet.
 *   - a conflict. The application already carries a setting somebody else put
 *     there, so enabling refused rather than overwriting it.
 *   - coming soon. A chip, and no control at all.
 */
export function AppTogglesDialog({
  open,
  onOpenChange,
  apps,
  onToggle,
  onRescan,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  apps: AppIntegration[];
  onToggle?: (id: string, enabled: boolean) => void;
  onRescan?: () => void;
}) {
  useComponentStyles('settings-page', SETTINGS_STYLES);
  useComponentStyles('app-toggles', APP_TOGGLES_STYLES);

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Apps"
      description="Which applications route through this shell."
      testId="settings-app-toggles"
    >
      <h2 className="settings__title">Apps</h2>
      <p className="settings__description">
        Turn one on and it sends its requests here. Turning one off leaves its
        own settings exactly as they were.
      </p>

      {apps.length === 0 ? (
        <EmptyState icon={TriangleAlert} message="No applications detected." />
      ) : (
        <ul className="app-list">
          {apps.map((app) => (
            <li className="app-card" key={app.id} data-testid={`app-${app.id}`}>
              <div className="app-card__head">
                <span className="app-card__name">{app.name}</span>

                {app.status === 'coming-soon' ? (
                  <Tag>{APP_STATUS_LABELS[app.status]}</Tag>
                ) : (
                  app.installCommand === undefined && (
                    <Switch
                      label={app.enabled ? 'On' : 'Off'}
                      checked={app.enabled}
                      disabled={onToggle === undefined || app.status === 'not-installed'}
                      onChange={(next) => onToggle?.(app.id, next)}
                      testId={`app-${app.id}-enabled`}
                    />
                  )
                )}
              </div>

              <p className="app-card__path">{app.path ?? APP_STATUS_LABELS[app.status]}</p>

              {app.installCommand !== undefined && (
                <div className="app-card__install">
                  <p className="settings__description">
                    Run this to install {app.name}, then scan again.
                  </p>
                  <code className="app-card__command">{app.installCommand}</code>
                  <div className="settings__row">
                    <CopyButton
                      text={app.installCommand}
                      label="Copy command"
                      testId={`app-${app.id}-copy`}
                    />
                    {onRescan && (
                      <Button size="sm" onClick={onRescan} testId={`app-${app.id}-rescan`}>
                        Scan again
                      </Button>
                    )}
                  </div>
                </div>
              )}

              {app.conflict !== undefined && (
                <Banner status="blocked" testId={`app-${app.id}-conflict`}>
                  <strong>Left your existing setting in place.</strong> {app.conflict}
                </Banner>
              )}
            </li>
          ))}
        </ul>
      )}

      <div className="settings__row settings__row--end">
        <Button
          onClick={() => {
            onOpenChange(false);
          }}
          testId="app-toggles-done"
        >
          Done
        </Button>
      </div>
    </Dialog>
  );
}
