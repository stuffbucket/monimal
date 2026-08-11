import { FolderOpen, ScrollText } from 'lucide-react';

import {
  diagnosticsBundle,
  type DiagnosticGroup,
  type LogLocation,
} from '../../lib/settings.js';
import { Button } from '../controls/Button.js';
import { EmptyState, StatusChip } from '../controls/Layout.js';

import { CopyButton } from './CopyButton.js';
import { SettingsPage, SettingsSection } from './SettingsPage.js';

/**
 * Logs and diagnostics.
 *
 * Read-only facts, a copyable bundle of them, and a way to reach the log
 * folder. That is what the parked shell had: it showed no log entries at all,
 * on the grounds that a per-day file is better read with `tail -F` than in a
 * viewer nobody would maintain. This ports that decision rather than the
 * viewer it declined to build.
 *
 * Which facts appear is the consumer's. The shell knows the shape of a
 * report — labelled groups of label-and-value rows — and not what is in one.
 *
 * A tab rather than a dialog. It is the surface a person keeps open while
 * reproducing the fault they are about to report.
 */
export function Diagnostics({
  groups,
  logs,
  onRevealLogs,
  onRevealConfig,
}: {
  groups: DiagnosticGroup[];
  logs?: LogLocation;
  onRevealLogs?: () => void;
  onRevealConfig?: () => void;
}) {
  return (
    <SettingsPage
      testId="settings-diagnostics"
      title="Logs and diagnostics"
      description="What this build is, what it is talking to, and where it writes its logs."
      actions={
        <>
          <CopyButton
            text={diagnosticsBundle(groups)}
            label="Copy report"
            testId="diagnostics-copy"
          />
          {onRevealConfig && (
            <Button size="sm" onClick={onRevealConfig} testId="diagnostics-reveal-config">
              <FolderOpen size={14} />
              Reveal configuration
            </Button>
          )}
        </>
      }
    >
      {logs && (
        <SettingsSection
          title="Log files"
          description="One file per day, written as requests are handled. Reveal the folder to read them, or follow the current one with `tail -F`."
          testId="diagnostics-logs"
        >
          <div className="field">
            <span className="field__label">Folder</span>
            <span className="field__value">{logs.path}</span>
          </div>
          <div className="field">
            <span className="field__label">Retention</span>
            <span className="field__value">
              {logs.retentionDays} days, then deleted on the next start
            </span>
          </div>
          {onRevealLogs && (
            <div className="settings__row">
              <Button size="sm" onClick={onRevealLogs} testId="diagnostics-reveal-logs">
                <ScrollText size={14} />
                Reveal logs
              </Button>
            </div>
          )}
        </SettingsSection>
      )}

      {groups.length === 0 ? (
        <EmptyState icon={ScrollText} message="Nothing to report yet." />
      ) : (
        groups.map((group) => (
          <SettingsSection key={group.id} title={group.label} testId={`diagnostics-${group.id}`}>
            {group.entries.map((entry) => (
              <div className="field" key={entry.label}>
                <span className="field__label">{entry.label}</span>
                <span className="field__value">
                  {/* A status colours the value rather than adding a second
                      one beside it. */}
                  {entry.status === undefined ? (
                    entry.value
                  ) : (
                    <StatusChip status={entry.status} label={entry.value} />
                  )}
                </span>
              </div>
            ))}
          </SettingsSection>
        ))
      )}
    </SettingsPage>
  );
}
