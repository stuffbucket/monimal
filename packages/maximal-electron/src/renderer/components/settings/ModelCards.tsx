import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { Cpu, RefreshCw } from 'lucide-react';
import { useState } from 'react';

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
import { EmptyState, Tag, ViewModeSwitch, type ViewMode } from '../controls/Layout.js';

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

function providerTone(provider: string | undefined): string {
  const normalized = provider?.trim().toLowerCase() ?? '';
  if (normalized.includes('anthropic') || normalized.includes('claude')) return 'anthropic';
  if (normalized.includes('openai') || normalized === 'gpt') return 'openai';
  if (normalized.includes('grok') || normalized.includes('xai')) return 'grok';
  if (normalized.includes('google') || normalized.includes('gemini')) return 'google';
  if (normalized.includes('mistral')) return 'mistral';
  if (normalized.includes('deepseek')) return 'deepseek';
  if (normalized.includes('meta') || normalized.includes('llama')) return 'meta';
  return 'neutral';
}

function ModelTable({ models, kind }: { models: ModelCard[]; kind: string }) {
  const content = useShellContent().models;
  return (
    <div className="model-table-wrap">
      <table className="model-table">
        <caption>
          <VisuallyHidden>
            {content.kinds[kind] ?? kind}
          </VisuallyHidden>
        </caption>
        <thead>
          <tr>
            <th scope="col">{content.model}</th>
            <th scope="col">{content.context}</th>
            <th scope="col">{content.maxOutput}</th>
            <th scope="col">{content.capabilities}</th>
          </tr>
        </thead>
        <tbody>
          {models.map((model) => (
            <tr key={model.id} data-testid={`model-${model.id}`}>
              <td>
                <strong>{model.name}</strong>
                <div className="model-table__id">{model.id}</div>
              </td>
              <td>{tokens(model.contextWindowTokens)}</td>
              <td>{tokens(model.maxOutputTokens)}</td>
              <td>
                <span className="model-table__caps">
                  {capabilityLabels(model.capabilities).map((label) => (
                    <Tag key={label}>{label}</Tag>
                  ))}
                  {capabilityLabels(model.capabilities).length === 0 && NO_VALUE}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const PROVIDER_ACCENTS: Record<string, string> = {
  anthropic: '#d97757',
  openai: '#10a37f',
  grok: '#f5f5f5',
  google: '#4285f4',
  mistral: '#f97316',
  deepseek: '#4d6bfe',
  meta: '#0866ff',
};

/**
 * The rules a model card draws itself with.
 *
 * They travel with the component so exporting one ships the other, and every
 * value is a token. `src/renderer/lib/component-styles.ts` says why.
 */
const MODEL_CARD_STYLES = `
.sb-shell .model-grid {
  display: grid;
  gap: var(--shell-space-4);
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
}

.sb-shell .settings__section-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--shell-space-3);
}

.sb-shell .settings__section-heading .settings__section-title {
  margin-bottom: 0;
}

.sb-shell .model-card {
  display: grid;
  gap: var(--shell-space-3);
  align-content: start;
  padding: var(--shell-space-4);
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius-large);
  background: var(--shell-raised);
}

.sb-shell .model-card:hover {
  transform: translateY(calc(-1 * var(--shell-space-1) / 2));
}

.sb-shell .model-table-wrap {
  overflow-x: auto;
}

.sb-shell .model-table {
  width: 100%;
  border-collapse: collapse;
  color: var(--shell-text);
}

.sb-shell .model-table th,
.sb-shell .model-table td {
  padding: var(--shell-space-3);
  border-bottom: 1px solid var(--shell-border);
  text-align: left;
  vertical-align: top;
}

.sb-shell .model-table th {
  color: var(--shell-text-subtle);
  font-size: var(--shell-text-xs);
  font-weight: var(--shell-weight-md);
  text-transform: uppercase;
}

.sb-shell .model-table td {
  font-size: var(--shell-text-sm);
}

.sb-shell .model-table__id {
  color: var(--shell-text-subtle);
  font-family: var(--shell-font-mono);
  font-size: var(--shell-text-xs);
  overflow-wrap: anywhere;
}

.sb-shell .model-table__caps {
  display: flex;
  flex-wrap: wrap;
  gap: var(--shell-space-1);
}
}

@media (prefers-reduced-motion: reduce) {
  .sb-shell .model-card {
    transition: none;
  }

  .sb-shell .model-card:hover {
    transform: none;
  }
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
/** A read-only model catalogue grouped by model type. */
export function ModelCardGrid({
  models,
}: {
  models: ModelCard[];
}) {
  useComponentStyles('model-cards', MODEL_CARD_STYLES);
  const [mode, setMode] = useState<ViewMode>('grid');

  const content = useShellContent().models;
  if (models.length === 0) {
    return <EmptyState icon={Cpu} message={content.empty} />;
  }

  return groupByKind(models).map((group) => (
    <section className="settings__section" key={group.kind}>
      <div className="settings__section-heading">
        <h2 className="settings__section-title">
          {content.kinds[group.kind] ?? group.kind} ({group.models.length})
        </h2>
        <ViewModeSwitch mode={mode} onChange={setMode} />
      </div>

      {mode === 'list' ? <ModelTable models={group.models} kind={group.kind} /> : (
        <div className="model-grid">
          {group.models.map((model) => {
            const tone = providerTone(model.provider);
            const accent = PROVIDER_ACCENTS[tone];
            const cardStyle = accent
              ? {
                  borderColor: `color-mix(in srgb, ${accent} 35%, var(--shell-border))`,
                  background: `color-mix(in srgb, ${accent} 12%, var(--shell-raised))`,
                }
              : undefined;
            return (
              <article
                className="model-card"
                key={model.id}
                data-provider={tone}
                data-testid={`model-${model.id}`}
                style={cardStyle}
              >
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
            );
          })}
        </div>
      )}
    </section>
  ));
}

/** A complete model-catalogue settings page with an optional refresh action. */
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
      <ModelCardGrid models={models} />
    </SettingsPage>
  );
}
