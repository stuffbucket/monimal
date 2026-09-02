import { Cpu, RefreshCw } from 'lucide-react';

import { useComponentStyles } from '../../lib/component-styles.js';
import { fill, useShellContent } from '../../lib/content.js';
import {
  capabilityLabels,
  groupByKind,
  NO_VALUE,
  relativeTime,
  formatCompact,
  type ModelCard,
} from '../../lib/settings.js';
import { Button } from '../controls/Button.js';
import { EmptyState, Tag } from '../controls/Layout.js';

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

function tokens(value: number | undefined): string {
  return value === undefined ? NO_VALUE : formatCompact(value);
}

/**
 * The rules a model card draws itself with.
 *
 * They travel with the component so exporting one ships the other, and every
 * value is a token. `src/renderer/lib/component-styles.ts` says why.
 */
const MODEL_CARD_STYLES = `
.sb-shell .model-grid {
  display: grid;
  gap: var(--shell-space-3);
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
}

.sb-shell .model-card {
  display: grid;
  gap: var(--shell-space-2);
  align-content: start;
  padding: var(--shell-space-3);
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-large);
  background: var(--shell-raised);
}

.sb-shell .model-card__head {
  display: flex;
  align-items: center;
  gap: var(--shell-space-2);
}

.sb-shell .model-card__name {
  margin: 0;
  flex: 1;
  min-width: 0;
  font-size: var(--shell-text-base);
  font-weight: var(--shell-weight-md);
  color: var(--shell-text);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-shell .model-card__id {
  margin: 0;
  font-family: var(--shell-font-mono);
  font-size: var(--shell-text-xs);
  color: var(--shell-text-subtle);
  overflow-wrap: anywhere;
}

.sb-shell .model-card__stats {
  display: flex;
  gap: var(--shell-space-4);
  margin: 0;
}

.sb-shell .model-card__stats dt {
  font-size: var(--shell-text-xs);
  color: var(--shell-text-subtle);
}

.sb-shell .model-card__stats dd {
  margin: 0;
  font-size: var(--shell-text-sm);
  color: var(--shell-text);
  font-variant-numeric: tabular-nums;
}

.sb-shell .model-card__caps {
  display: flex;
  flex-wrap: wrap;
  gap: var(--shell-space-1);
  margin: 0;
  font-size: var(--shell-text-xs);
  color: var(--shell-text-subtle);
}
`;

/**
 * The models a provider offers, as a catalogue.
 *
 * A tab rather than a dialog: a grid that grows with the provider, read while
 * something else is being configured, and worth leaving open.
 *
 * Fetches nothing. The caller supplies the cards and the refresh action.
 */
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
  useComponentStyles('model-cards', MODEL_CARD_STYLES);

  const content = useShellContent().models;
  const freshness =
    loadedAtMs === undefined
      ? content.neverLoaded
      : fill(content.updated, { when: relativeTime(loadedAtMs, nowMs) });

  return (
    <SettingsPage
      testId="settings-model-cards"
      title={content.title}
      description={content.description}
      actions={
        <>
          <span className="settings__note">{freshness}</span>
          {onRefresh && (
            <Button size="sm" onClick={onRefresh} disabled={refreshing} testId="models-refresh">
              <RefreshCw size={14} />
              {refreshing ? content.refreshing : content.refresh}
            </Button>
          )}
        </>
      }
    >
      {models.length === 0 ? (
        <EmptyState icon={Cpu} message={content.empty} />
      ) : (
        groupByKind(models).map((group) => (
          <section className="settings__section" key={group.kind}>
            <h2 className="settings__section-title">
              {content.kinds[group.kind] ?? group.kind} ({group.models.length})
            </h2>

            <div className="model-grid">
              {group.models.map((model) => (
                <article className="model-card" key={model.id} data-testid={`model-${model.id}`}>
                  <header className="model-card__head">
                    <h3 className="model-card__name">{model.name}</h3>
                    {model.preview === true && <Tag>{content.preview}</Tag>}
                  </header>
                  <p className="model-card__id">{model.id}</p>

                  <dl className="model-card__stats">
                    <div>
                      <dt>{content.context}</dt>
                      <dd>{tokens(model.contextWindowTokens)}</dd>
                    </div>
                    <div>
                      <dt>{content.maxOutput}</dt>
                      <dd>{tokens(model.maxOutputTokens)}</dd>
                    </div>
                  </dl>

                  <p className="model-card__caps">
                    {capabilityLabels(model.capabilities).map((label) => (
                      <Tag key={label}>{label}</Tag>
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
