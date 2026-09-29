/**
 * The settings model.
 *
 * Ported from the parked Tauri shell by function, not by appearance. What
 * carries over is which facts a model card states, what an API client entry
 * holds, what a diagnostics report is made of, and what a usage dashboard
 * counts. What does not carry over is that shell's markup, its stylesheet, or
 * its transport: it read a local proxy over HTTP, and this shell reads props.
 *
 * The same rule as `lib/account.ts`. A consumer supplies the values; the shell
 * supplies the surface. Nothing here fetches, stores, or validates a secret —
 * an API key here is a field, never a value, and this repository holds none.
 */

/** A settings surface the profile menu opens. */
export type SettingsSurface =
  'model-cards' | 'api-keys' | 'app-toggles' | 'diagnostics' | 'usage';

/** Shown where a value is absent or a cost is nil. */
export const NO_VALUE = '—';

/* ------------------------------------------------------------ model cards */

/** What a model can do. Only the true ones are shown. */
export interface ModelCapabilities {
  vision: boolean;
  imageGeneration?: boolean;
  videoGeneration?: boolean;
  toolCalls: boolean;
  streaming: boolean;
  reasoning: boolean;
}

/**
 * One model in the catalogue.
 *
 * Read-only. The Tauri shell offered no action on a card — no default, no pin,
 * no per-model override — because routing is decided by configuration rather
 * than by selection, and nothing here changes that.
 */
export interface ModelCard {
  id: string;
  name: string;
  /** Groups the catalogue: `chat`, `embeddings`, whatever a provider reports. */
  kind: string;
  /** Provider name used to give the card a restrained brand tint. */
  provider?: string;
  /** Local models use the neutral card treatment. */
  local?: boolean;
  /** A provider-level gate currently prevents this model from being used. */
  disabled?: boolean;
  /** Accessible action text when a disabled card can open remediation. */
  activationLabel?: string;
  preview?: boolean;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  capabilities: ModelCapabilities;
}

const CAPABILITY_LABELS: [keyof ModelCapabilities, string][] = [
  ['vision', 'Vision'],
  ['imageGeneration', 'Image generation'],
  ['videoGeneration', 'Video generation'],
  ['toolCalls', 'Tools'],
  ['streaming', 'Streaming'],
  ['reasoning', 'Reasoning'],
];

/** The chips a card shows. Absent capabilities are not shown as absent. */
export function capabilityLabels(capabilities: ModelCapabilities): string[] {
  return CAPABILITY_LABELS.filter(([key]) => capabilities[key]).map(
    ([, label]) => label,
  );
}

/**
 * Group the catalogue by kind, preserving the order it arrived in.
 *
 * The provider decides the order, and re-sorting would hide a deliberate one.
 * A `Map` rather than a scan of the groups so far: `Map` keeps insertion order
 * and answers in one lookup.
 */
export function groupByKind(models: ModelCard[]): {
  kind: string;
  models: ModelCard[];
}[] {
  const groups = new Map<string, ModelCard[]>();

  for (const model of models) {
    const group = groups.get(model.kind);
    if (group) group.push(model);
    else groups.set(model.kind, [model]);
  }

  return [...groups].map(([kind, grouped]) => ({ kind, models: grouped }));
}

/* --------------------------------------------------------------- API keys */

/** The endpoint an application points at. Read-only, and copyable. */
export interface Endpoint {
  baseUrl: string;
  /** The current key. Masked until revealed; never persisted by the shell. */
  key?: string;
  routes: { method: string; path: string; label: string }[];
}

/** One named client, so a user can tell one tool from another. */
export interface ApiClient {
  id: string;
  label: string;
  key: string;
  enabled: boolean;
}

/** The longest run of bullets a masked key shows. */
export const MASK_LIMIT = 24;

/**
 * Bullets in place of a secret.
 *
 * Capped, so a long key does not report its own length. The mask is an
 * affordance and not a protection: whoever renders this already holds the
 * value.
 */
export function maskSecret(value: string): string {
  return '•'.repeat(Math.min(value.length, MASK_LIMIT));
}

/** 1 to 64 characters, as the parked shell required. Trimmed first. */
export const MAX_LABEL_LENGTH = 64;

/** Why a client label is not acceptable, or undefined when it is. */
export function labelError(label: string): string | undefined {
  const trimmed = label.trim();
  if (trimmed === '') return 'Give this connection a name.';
  if (trimmed.length > MAX_LABEL_LENGTH)
    return `Keep this under ${String(MAX_LABEL_LENGTH)} characters.`;
  return undefined;
}

/**
 * A short number.
 *
 * One decimal below ten, none above: `1.2K` reads and `999.4K` does not.
 */
export function formatCompact(value: number): string {
  if (value < 1000) return String(value);

  const [scaled, suffix] =
    value < 1_000_000 ? [value / 1000, 'K'] : [value / 1_000_000, 'M'];

  return `${scaled < 10 ? scaled.toFixed(1) : String(Math.round(scaled))}${suffix}`;
}
