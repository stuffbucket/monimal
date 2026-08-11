import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import {
  labelError,
  maskSecret,
  type ApiClient,
  type Endpoint,
} from '../../lib/settings.js';
import { Button, IconButton } from '../controls/Button.js';
import { FormField, Switch, TextInput } from '../controls/Fields.js';
import { EmptyState } from '../controls/Layout.js';
import { Dialog } from '../controls/Overlays.js';

import { CopyButton } from './CopyButton.js';
import { SettingsSection } from './SettingsPage.js';

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
  const [revealed, setRevealed] = useState(false);

  return (
    <span className="secret">
      <code className="secret__value" data-testid={testId}>
        {revealed ? value : maskSecret(value)}
      </code>
      <IconButton
        label={`${revealed ? 'Hide' : 'Reveal'} ${name}`}
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
      title="API keys"
      description="The endpoint applications call, and the keys that identify them."
      className="dialog dialog--wide"
      testId="settings-api-keys"
    >
      <h2 className="settings__title">API keys</h2>

      {endpoint && (
        <SettingsSection
          title="Endpoint"
          description="What an application points at."
          as="h3"
          testId="api-keys-endpoint"
        >
          <div className="field">
            <span className="field__label">Base URL</span>
            <span className="field__value">
              {endpoint.baseUrl}
              <CopyButton
                text={endpoint.baseUrl}
                about="the base URL"
                testId="endpoint-copy-url"
              />
            </span>
          </div>

          {endpoint.key !== undefined && (
            <div className="field">
              <span className="field__label">Key</span>
              <span className="field__value">
                <Secret value={endpoint.key} name="the endpoint key" testId="endpoint-key" />
              </span>
            </div>
          )}

          {endpoint.routes.map((route) => (
            <div className="field" key={route.path}>
              <span className="field__label">{route.label}</span>
              <span className="field__value">
                {route.method} {route.path}
              </span>
            </div>
          ))}
        </SettingsSection>
      )}

      <SettingsSection
        title="Connections"
        description="One key per tool, so they can be told apart. Anything not listed still works."
        as="h3"
        testId="api-keys-clients"
      >
        {clients.length === 0 ? (
          <EmptyState
            icon={Plus}
            message="Nothing here yet. Add a connection for each application you want to recognise."
          />
        ) : (
          <ul className="client-list">
            {clients.map((client) => (
              <li className="client" key={client.id} data-testid={`client-${client.id}`}>
                <span className="client__label">{client.label}</span>
                <Secret
                  value={client.key}
                  name={`the ${client.label} key`}
                  testId={`client-${client.id}-key`}
                />
                <Switch
                  label={client.enabled ? 'On' : 'Off'}
                  checked={client.enabled}
                  onChange={(next) => onToggleClient?.(client.id, next)}
                  disabled={onToggleClient === undefined}
                  testId={`client-${client.id}-enabled`}
                />
                {onRemoveClient && (
                  <IconButton
                    danger
                    label={`Remove ${client.label}`}
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
              label="What is this connection for?"
              hint="A name you will recognise later."
              error={error}
            >
              {(field) => (
                <TextInput
                  {...field}
                  value={draft}
                  onChange={setDraft}
                  placeholder="e.g. Claude Code, Cursor, Raycast"
                  testId="client-new-label"
                />
              )}
            </FormField>
            <Button variant="primary" onClick={add} testId="client-add">
              Add
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
          Done
        </Button>
      </div>
    </Dialog>
  );
}
