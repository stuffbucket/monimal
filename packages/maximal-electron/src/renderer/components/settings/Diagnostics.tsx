import { FolderOpen, ScrollText } from 'lucide-react';

import { fill, useShellContent } from '../../lib/content.js';
import {
  diagnosticsBundle,
  type DiagnosticGroup,
  type LogLocation,
} from '../../lib/settings.js';
import { Button } from '../controls/Button.js';
import { Field, FieldList } from '../controls/Fields.js';
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
  const content = useShellContent().diagnostics;

  return (
    <SettingsPage
      testId="settings-diagnostics"
      title={content.title}
      description={content.description}
      actions={
        <>
          <CopyButton
            text={diagnosticsBundle(groups)}
            label={content.copyReport}
            testId="diagnostics-copy"
          />
          {onRevealConfig && (
            <Button size="sm" onClick={onRevealConfig} testId="diagnostics-reveal-config">
              <FolderOpen size={14} />
              {content.revealConfiguration}
            </Button>
          )}
        </>
      }
    >
      {logs && (
        <SettingsSection
          title={content.logsTitle}
          description={content.logsDescription}
          testId="diagnostics-logs"
        >
          <FieldList>
            <Field label={content.folder} value={logs.path} />
            <Field
              label={content.retention}
              value={fill(content.retentionValue, { days: logs.retentionDays })}
            />
          </FieldList>
          {onRevealLogs && (
            <div className="settings__row">
              <Button size="sm" onClick={onRevealLogs} testId="diagnostics-reveal-logs">
                <ScrollText size={14} />
                {content.revealLogs}
              </Button>
            </div>
          )}
        </SettingsSection>
      )}

      {groups.length === 0 ? (
        <EmptyState icon={ScrollText} message={content.empty} />
      ) : (
        groups.map((group) => (
          <SettingsSection key={group.id} title={group.label} testId={`diagnostics-${group.id}`}>
            <FieldList>
              {group.entries.map((entry) => (
                <Field
                  key={entry.label}
                  label={entry.label}
                  // A status colours the value rather than adding a second one
                  // beside it.
                  value={
                    entry.status === undefined ? (
                      entry.value
                    ) : (
                      <StatusChip status={entry.status} label={entry.value} />
                    )
                  }
                />
              ))}
            </FieldList>
          </SettingsSection>
        ))
      )}
    </SettingsPage>
  );
}
