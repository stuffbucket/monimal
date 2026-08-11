import type {
  AgentApproval,
  AppVersions,
  Preferences,
  UpdateStatus,
} from '../../shared/ipc.js';
import { bridge } from '../lib/bridge.js';
import type { Item } from '../lib/data.js';
import type { TerminalSession } from '../lib/terminal-transport.js';

import { Button, Field, FormField, InspectorPanel, Select, Switch } from './Controls.js';

function updateLabel(status: UpdateStatus): string {
  switch (status.state) {
    case 'idle':
      return 'Not checked';
    case 'checking':
      return 'Checking…';
    case 'unsupported':
      return 'No update channel';
    case 'available':
      return `Update available: ${status.version}`;
    case 'up-to-date':
      return `Up to date (${status.version})`;
    case 'error':
      return `Error: ${status.message}`;
  }
}

/**
 * The collapsible right panel.
 *
 * It is an inspector, in the Figma sense: it shows properties of the current
 * selection, and falls back to application settings when nothing is selected.
 * Collapse is owned by `react-resizable-panels` in `App.tsx`.
 */
export function Inspector({
  item,
  versions,
  prefs,
  onPrefChange,
  updateStatus,
  onCheckUpdates,
  detachedTerminals,
  onReattachTerminal,
}: {
  item: Item | undefined;
  versions: AppVersions | undefined;
  prefs: Preferences | undefined;
  onPrefChange: (patch: Partial<Preferences>) => void;
  updateStatus: UpdateStatus;
  onCheckUpdates: () => void;
  /** Shells still running with no tab. Empty unless `terminalDetach` is on. */
  detachedTerminals: TerminalSession[];
  onReattachTerminal: (id: string) => void;
}) {
  return (
    <InspectorPanel title={item ? 'Properties' : 'Settings'}>
      {item ? (
          <section>
            <Field label="Name" value={item.name} />
            <Field label="Kind" value={item.kind} />
            <Field label="Author" value={item.author} />
            <Field label="Edited" value={item.updated} />
            <Field label="Size" value={item.size} />
          </section>
        ) : (
          <p className="card__sub card__sub--wrap">
            Select an item to inspect its properties.
          </p>
        )}

        {prefs && (
          <section style={{ display: 'grid', gap: 'var(--space-2)' }}>
            <h3 className="inspector__title">Application</h3>
            <Switch
              label="Menu bar icon"
              checked={prefs.menuBarIcon}
              onChange={(next) => onPrefChange({ menuBarIcon: next })}
              testId="pref-menubar"
            />
            <Switch
              label="Dock badge"
              checked={prefs.dockBadge}
              onChange={(next) => onPrefChange({ dockBadge: next })}
              testId="pref-dock"
            />
            <Switch
              label="Splash screen"
              checked={prefs.splash}
              onChange={(next) => onPrefChange({ splash: next })}
              testId="pref-splash"
            />
            <Switch
              label="Agent tools"
              checked={prefs.agentTools}
              onChange={(next) => onPrefChange({ agentTools: next })}
              testId="pref-agent-tools"
            />
            <p className="card__sub card__sub--wrap">
              Lets the overlay agent read, write, and run shell commands in your
              working directory.
            </p>
            {prefs.agentTools && (
              <FormField label="Ask before running">
                {(field) => (
                  <Select
                    {...field}
                    value={prefs.agentApproval}
                    onChange={(agentApproval: AgentApproval) =>
                      onPrefChange({ agentApproval })
                    }
                    options={[
                      { value: 'writes', label: 'Anything that changes files' },
                      { value: 'all', label: 'Every tool' },
                      { value: 'none', label: 'Never ask' },
                    ]}
                    testId="pref-agent-approval"
                  />
                )}
              </FormField>
            )}
            <Switch
              label="Light theme"
              checked={prefs.theme === 'light'}
              onChange={(next) => onPrefChange({ theme: next ? 'light' : 'dark' })}
              testId="pref-theme"
            />
            <Switch
              label="Keep terminals running"
              checked={prefs.terminalDetach}
              onChange={(next) => onPrefChange({ terminalDetach: next })}
              testId="pref-terminal-detach"
            />
            <p className="card__sub card__sub--wrap">
              Closing a terminal tab leaves its shell running. It appears below,
              and reopening it attaches to the same process. Closing the window
              still ends every shell it started.
            </p>
          </section>
        )}

        {detachedTerminals.length > 0 && (
          <section style={{ display: 'grid', gap: 'var(--space-2)' }}>
            <h3 className="inspector__title">Running terminals</h3>
            {detachedTerminals.map((session) => (
              <Button
                key={session.id}
                block
                onClick={() => onReattachTerminal(session.id)}
                testId={`reattach-${session.id}`}
              >
                {session.id} in {session.cwd}
              </Button>
            ))}
          </section>
        )}

        <section style={{ display: 'grid', gap: 'var(--space-2)' }}>
          <h3 className="inspector__title">Native</h3>
          <Button
            block
            onClick={() =>
              void bridge.invoke('notify:show', {
                title: 'Stuffbucket',
                body: 'This is a native notification.',
                urgent: true,
              })
            }
            testId="send-notification"
          >
            Send a test notification
          </Button>
          <Button block onClick={onCheckUpdates} testId="check-updates">
            Check for updates
          </Button>
          <p className="card__sub card__sub--wrap">{updateLabel(updateStatus)}</p>
        </section>

        {versions && (
          <section>
            <h3 className="inspector__title">Runtime</h3>
            <Field label="App" value={versions.app} />
            <Field label="Electron" value={versions.electron} />
            <Field label="Chrome" value={versions.chrome} />
            <Field label="Node" value={versions.node} />
            <Field
              label="Platform"
              value={`${versions.platform} ${versions.arch}`}
            />
            <Field label="Packaged" value={String(versions.packaged)} />
          </section>
        )}
    </InspectorPanel>
  );
}
