import { Cpu, RefreshCw } from 'lucide-react';

import {
  capabilityLabels,
  groupByKind,
  NO_VALUE,
  relativeTime,
  formatCompact,
  type ModelCard,
} from '../../lib/settings.js';
import { Button } from '../controls/Button.js';
import { EmptyState } from '../controls/Layout.js';

import { SettingsPage } from './SettingsPage.js';

/**
 * The model catalogue.
 *
 * Read-only, as it was in the parked shell: routing is decided by
 * configuration, so there is nothing to select. What a card states is what
 * that shell stated — name, identifier, whether it is a preview, the two token
 * limits, and the capabilities it actually has. Vendor and family were fetched
 * there and never shown, so they are not in `ModelCard` here.
 *
 * A tab rather than a dialog. It is a catalogue: a grid that grows with the
 * provider, read while something else is being configured, and worth leaving
 * open.
 */

const KIND_LABELS: Record<string, string> = {
  chat: 'Chat models',
  embeddings: 'Embeddings',
};

function tokens(value: number | undefined): string {
  return value === undefined ? NO_VALUE : formatCompact(value);
}

export function ModelCards({
  models,
  loadedAtMs,
  nowMs = Date.now(),
  onRefresh,
  refreshing = false,
}: {
  models: ModelCard[];
  /** When the catalogue was last pulled. Absent means never. */
  loadedAtMs?: number;
  /** An argument so a story and a test can pin the freshness label. */
  nowMs?: number;
  onRefresh?: () => void;
  refreshing?: boolean;
}) {
  const freshness =
    loadedAtMs === undefined
      ? 'Not loaded yet'
      : `Updated ${relativeTime(loadedAtMs, nowMs)}`;

  return (
    <SettingsPage
      testId="settings-model-cards"
      title="Model cards"
      description="Models available to applications through this shell, grouped by kind. The list comes from the provider."
      actions={
        <>
          <span className="settings__note">{freshness}</span>
          {onRefresh && (
            <Button size="sm" onClick={onRefresh} disabled={refreshing} testId="models-refresh">
              <RefreshCw size={14} />
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          )}
        </>
      }
    >
      {models.length === 0 ? (
        <EmptyState icon={Cpu} message="No models cached yet." />
      ) : (
        groupByKind(models).map((group) => (
          <section className="settings__section" key={group.kind}>
            <h2 className="settings__section-title">
              {KIND_LABELS[group.kind] ?? group.kind} ({group.models.length})
            </h2>

            <div className="model-grid">
              {group.models.map((model) => (
                <article className="model-card" key={model.id} data-testid={`model-${model.id}`}>
                  <header className="model-card__head">
                    <h3 className="model-card__name">{model.name}</h3>
                    {model.preview === true && <span className="tag">Preview</span>}
                  </header>
                  <p className="model-card__id">{model.id}</p>

                  <dl className="model-card__stats">
                    <div>
                      <dt>Context</dt>
                      <dd>{tokens(model.contextWindowTokens)}</dd>
                    </div>
                    <div>
                      <dt>Max out</dt>
                      <dd>{tokens(model.maxOutputTokens)}</dd>
                    </div>
                  </dl>

                  <p className="model-card__caps">
                    {capabilityLabels(model.capabilities).map((label) => (
                      <span className="tag" key={label}>
                        {label}
                      </span>
                    ))}
                    {capabilityLabels(model.capabilities).length === 0 && NO_VALUE}
                  </p>
                </article>
              ))}
            </div>
          </section>
        ))
      )}
    </SettingsPage>
  );
}
