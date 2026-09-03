import { useComponentStyles } from '../../lib/component-styles.js';
import { fill, useShellContent } from '../../lib/content.js';
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import {
  labelError,
  maskSecret,
  type ApiClient,
  type Endpoint,
} from '../../lib/settings.js';
import { Button, IconButton } from '../controls/Button.js';
import { Field, FieldList, FormField, Switch, TextInput } from '../controls/Fields.js';
import { EmptyState } from '../controls/Layout.js';
import { Dialog } from '../controls/Overlays.js';

import { CopyButton } from './CopyButton.js';
import { SETTINGS_STYLES, SettingsSection } from './SettingsPage.js';

/**
 * The endpoint, and the clients that call it.
 *
 * A dialog rather than a tab, for the one reason that separates this surface
 * from the others: it is the only one that puts a secret on the screen. A
 * modal is dismissed when the task is done, where a tab keeps a revealed key
 * behind whatever is in front of it. The task is bounded too — name a client,
 * copy its key, revoke it — which is what a dialog is for.
 *
 * Wide, because a key and its controls do not fit the default 520px.
 *
 * No key is stored, generated, or validated here. A consumer holds the values;
 * this shows them. `labelError` is the only rule the shell owns, and it is
 * about a name, not a secret.
 */

/**
 * A secret, with the controls that make it usable.
 *
 * `name` is not decoration. A dialog listing four keys otherwise announces
 * four controls called "Reveal key", and a screen reader cannot tell which
 * one belongs to which connection.
 */
function Secret({
  value,
  name,
  testId,
}: {
  value: string;
  name: string;
  testId: string;
}) {
  const content = useShellContent().apiKeys;
  const [revealed, setRevealed] = useState(false);

  return (
    <span className="secret">
      <code className="secret__value" data-testid={testId}>
        {revealed ? value : maskSecret(value)}
      </code>
      <IconButton
        label={fill(revealed ? content.hide : content.reveal, { name })}
        onClick={() => {
          setRevealed(!revealed);
        }}
        testId={`${testId}-reveal`}
      >
        {revealed ? <EyeOff size={14} /> : <Eye size={14} />}
      </IconButton>
      <CopyButton text={value} about={name} testId={`${testId}-copy`} />
    </span>
  );
}

/**
 * The rules the key list draws itself with.
 *
 * They travel with the component so exporting one ships the other, and every
 * value is a token. `src/renderer/lib/component-styles.ts` says why.
 */
const API_KEYS_STYLES = `
/*
 * How tall the list may grow before it scrolls. A share of the viewport rather
 * than a size on any ramp, so it is this sheet's token.
 */
.sb-shell {
  --shell-keys-dialog-max-height: 80vh;
}
/*
 * A dialog holding a list rather than a sentence.
 *
 * The default 520px fits a confirmation. A key, its reveal and its copy button
 * on one line do not fit in it.
 */
.sb-shell .dialog--wide {
  width: min(720px, 92vw);
  max-height: var(--shell-keys-dialog-max-height);
  overflow-y: auto;
}

.sb-shell .secret {
  display: inline-flex;
  align-items: center;
  gap: var(--shell-space-1);
  min-width: 0;
}

.sb-shell .secret__value {
  padding: 0 var(--shell-space-2);
  height: var(--shell-control-lg);
  display: inline-flex;
  align-items: center;
  border-radius: var(--shell-radius);
  border: 1px solid var(--shell-input-border);
  background: var(--shell-input-background);
  font-family: var(--shell-font-mono);
  font-size: var(--shell-text-xs);
  color: var(--shell-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-shell .client-list,
.sb-shell .app-list {
  list-style: none;
  margin: 0;
  padding: 0;
  display: grid;
  gap: var(--shell-space-2);
}

.sb-shell .client {
  display: flex;
  align-items: center;
  gap: var(--shell-space-2);
  padding: var(--shell-space-2);
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius);
}

.sb-shell .client__label {
  flex: 1;
  min-width: 0;
  font-size: var(--shell-text-sm);
  color: var(--shell-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The switch fills its container by default, which is right in the inspector
   and wrong in a row that already has four things in it. */
.sb-shell .client .switch {
  width: auto;
  flex: none;
}
`;

/**
 * The keys a consumer issues, and the switch that requires one.
 *
 * A dialog rather than a tab: issuing a key is a bounded task, and the key
 * itself is a secret that should leave the screen when the task is done.
 *
 * Holds no keys. The caller supplies the list and handles every action.
 */
export function ApiKeysDialog({
  open,
  onOpenChange,
  endpoint,
  clients,
  onAddClient,
  onRemoveClient,
  onToggleClient,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  endpoint?: Endpoint;
  clients: ApiClient[];
  onAddClient?: (label: string) => void;
  onRemoveClient?: (id: string) => void;
  onToggleClient?: (id: string, enabled: boolean) => void;
}) {
  useComponentStyles('settings-page', SETTINGS_STYLES);
  useComponentStyles('api-keys', API_KEYS_STYLES);

  const content = useShellContent().apiKeys;

  const [draft, setDraft] = useState('');
  const [touched, setTouched] = useState(false);
  const error = touched ? labelError(draft) : undefined;

  const add = () => {
    setTouched(true);
    if (labelError(draft) !== undefined) return;
    onAddClient?.(draft.trim());
    setDraft('');
    setTouched(false);
  };

  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title={content.title}
      description={content.description}
      className="dialog dialog--wide"
      testId="settings-api-keys"
    >
      <h2 className="settings__title">{content.title}</h2>

      {endpoint && (
        <SettingsSection
          title={content.endpointTitle}
          description={content.endpointDescription}
          as="h3"
          testId="api-keys-endpoint"
        >
          <FieldList>
            <Field
              label={content.baseUrl}
              value={
                <>
                  {endpoint.baseUrl}
                  <CopyButton
                    text={endpoint.baseUrl}
                    about={content.baseUrlAbout}
                    testId="endpoint-copy-url"
                  />
                </>
              }
            />

            {endpoint.key !== undefined && (
              <Field
                label={content.key}
                value={
                  <Secret
                    value={endpoint.key}
                    name={content.endpointKeyName}
                    testId="endpoint-key"
                  />
                }
              />
            )}

            {endpoint.routes.map((route) => (
              <Field
                key={route.path}
                label={route.label}
                value={`${route.method} ${route.path}`}
              />
            ))}
          </FieldList>
        </SettingsSection>
      )}

      <SettingsSection
        title={content.connectionsTitle}
        description={content.connectionsDescription}
        as="h3"
        testId="api-keys-clients"
      >
        {clients.length === 0 ? (
          <EmptyState
            icon={Plus}
            message={content.empty}
          />
        ) : (
          <ul className="client-list">
            {clients.map((client) => (
              <li className="client" key={client.id} data-testid={`client-${client.id}`}>
                <span className="client__label">{client.label}</span>
                <Secret
                  value={client.key}
                  name={fill(content.clientKeyName, { name: client.label })}
                  testId={`client-${client.id}-key`}
                />
                <Switch
                  label={client.enabled ? content.on : content.off}
                  checked={client.enabled}
                  onChange={(next) => onToggleClient?.(client.id, next)}
                  disabled={onToggleClient === undefined}
                  testId={`client-${client.id}-enabled`}
                />
                {onRemoveClient && (
                  <IconButton
                    danger
                    label={fill(content.remove, { name: client.label })}
                    onClick={() => {
                      onRemoveClient(client.id);
                    }}
                    testId={`client-${client.id}-remove`}
                  >
                    <Trash2 size={14} />
                  </IconButton>
                )}
              </li>
            ))}
          </ul>
        )}

        {onAddClient && (
          <div className="settings__row settings__row--bottom">
            <FormField
              label={content.addLabel}
              hint={content.addHint}
              error={error}
            >
              {(field) => (
                <TextInput
                  {...field}
                  value={draft}
                  onChange={setDraft}
                  placeholder={content.addPlaceholder}
                  testId="client-new-label"
                />
              )}
            </FormField>
            <Button variant="primary" onClick={add} testId="client-add">
              {content.add}
            </Button>
          </div>
        )}
      </SettingsSection>

      <div className="settings__row settings__row--end">
        <Button
          onClick={() => {
            onOpenChange(false);
          }}
          testId="api-keys-done"
        >
          {content.done}
        </Button>
      </div>
    </Dialog>
  );
}
