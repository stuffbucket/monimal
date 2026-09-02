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
  | 'model-cards'
  | 'api-keys'
  | 'app-toggles'
  | 'diagnostics'
  | 'usage';

/** Shown where a value is absent or a cost is nil. */
export const NO_VALUE = '—';

/* ------------------------------------------------------------ model cards */

/** What a model can do. Only the true ones are shown. */
export interface ModelCapabilities {
  vision: boolean;
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
  preview?: boolean;
  contextWindowTokens?: number;
  maxOutputTokens?: number;
  capabilities: ModelCapabilities;
}

const CAPABILITY_LABELS: [keyof ModelCapabilities, string][] = [
  ['vision', 'Vision'],
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

/* ------------------------------------------------------------ app toggles */

export type AppStatus = 'ready' | 'not-installed' | 'coming-soon';

/**
 * An application the shell can route through itself.
 *
 * `conflict` carries the one refusal that matters: the application already has
 * a setting somebody else put there, so enabling left it alone rather than
 * overwriting it.
 */
export interface AppIntegration {
  id: string;
  name: string;
  status: AppStatus;
  enabled: boolean;
  /** Where the installed binary or configuration file was found. */
  path?: string;
  /** Shown when nothing is installed: what to run to get it. */
  installCommand?: string;
  conflict?: string;
}

/* ---------------------------------------------------------- diagnostics */

/** One read-only fact. `status` colours it through the usual attribute. */
export interface Diagnostic {
  label: string;
  value: string;
  status?: string;
}

export interface DiagnosticGroup {
  id: string;
  label: string;
  entries: Diagnostic[];
}

/** Where the log files are, and how long they last. */
export interface LogLocation {
  path: string;
  retentionDays: number;
}

/**
 * The text of the copy-to-clipboard bundle.
 *
 * Indented JSON, because it is pasted into an issue. The parked shell copied
 * its diagnostics response verbatim and deliberately included no configuration
 * and no secret sources, which is why this takes only what is on screen.
 */
export function diagnosticsBundle(groups: DiagnosticGroup[]): string {
  const report: Record<string, Record<string, string>> = {};
  for (const group of groups) {
    const entries: Record<string, string> = {};
    for (const entry of group.entries) entries[entry.label] = entry.value;
    report[group.label] = entries;
  }
  return JSON.stringify(report, undefined, 2);
}

/* ---------------------------------------------------------------- usage */

export type UsagePeriod = 'day' | 'week' | 'month' | 'all';

/**
 * The periods a usage report can cover, in the order they are offered.
 *
 * Ids only. What each one is called, and the noun a sentence uses for it, are
 * content and live in `content.ts` — this used to carry `label` and `noun`,
 * which put four user-facing strings in a module about arithmetic.
 */
export const USAGE_PERIODS: UsagePeriod[] = ['day', 'week', 'month', 'all'];

/** The four token classes, plus what they cost and how often they were asked. */
export interface UsageTotals {
  input: number;
  output: number;
  cacheRead: number;
  cacheCreation: number;
  requests: number;
  total: number;
  /** Billing units, in nano. Zero means the period had no cost to report. */
  nanoCost: number;
}

export interface UsageBreakdown {
  id: string;
  label: string;
  totals: UsageTotals;
  premium?: boolean;
}

export interface UsageEvent {
  id: string;
  atMs: number;
  provider: string;
  model: string;
  endpoint: string;
  input: number;
  output: number;
  total: number;
}

export interface UsageReport {
  totals: UsageTotals;
  byProvider: UsageBreakdown[];
  byModel: UsageBreakdown[];
  events: UsageEvent[];
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

/**
 * Cost, or nothing.
 *
 * An em dash rather than `0.000`, because a period with no cost has no cost to
 * state, and a zero reads as a measurement someone took.
 */
export function formatCost(nanoCost: number): string {
  if (nanoCost <= 0) return NO_VALUE;
  return `${(nanoCost / 1_000_000_000).toFixed(3)} AIU`;
}

/** A segment's width, as a percentage. A total of nothing is an empty bar. */
export function share(value: number, total: number): number {
  if (total <= 0) return 0;
  return (value / total) * 100;
}

/**
 * How long ago, in one unit.
 *
 * `now` is an argument rather than a call to `Date.now`, so this is a function
 * of its inputs and a test does not have to move the clock. A timestamp in the
 * future reads as "just now" rather than as a negative age.
 */
export function relativeTime(atMs: number, nowMs: number): string {
  const seconds = Math.floor((nowMs - atMs) / 1000);
  if (seconds < 3) return 'just now';
  if (seconds < 60) return `${String(seconds)}s ago`;

  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${String(minutes)}m ago`;

  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${String(hours)}h ago`;

  return `${String(Math.floor(hours / 24))}d ago`;
}
