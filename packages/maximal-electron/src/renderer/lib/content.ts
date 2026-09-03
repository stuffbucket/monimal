import { createContext, createElement, useContext, type ReactNode } from 'react';

import type { AppStatus, UsagePeriod } from './settings.js';

/**
 * The words a surface says, held outside the surface that says them.
 *
 * Five exported components carried fifty-seven user-facing strings in their
 * own source — titles, section headings, column headers, empty states, button
 * labels. A reusable control cannot do that. It fixes the language, it fixes
 * the product's voice, and it puts the one thing a consumer is most certain to
 * want to change in the one place they cannot reach: the view.
 *
 * So the view holds keys and this holds the strings. That is the seam the
 * repository owner asked for — "do not embed content into the UI controls any
 * more" — and it is where every workbench that ships to other people puts it.
 * VS Code compiles `nls.localize` calls out to a message bundle; Theia and
 * `react-intl` do the same with a catalogue and a provider. None of them hold
 * copy in a component.
 *
 * ## What ships as the default
 *
 * `SHELL_CONTENT` below, in English. A package whose components render
 * placeholder text on install would be a package nobody could evaluate, and
 * every system named above ships a default bundle for the same reason. The
 * point of the seam is not that the package supplies nothing; it is that what
 * it supplies is *data a consumer replaces*, in a module they can import,
 * rather than a literal inside a component they can only fork.
 *
 * `LOREM_CONTENT` in `content-lorem.ts` is the stub — the same shape, filled
 * with lorem ipsum. Stories render under it, and
 * `tests/content-seam.test.ts` renders every surface under it and fails on any
 * English word that still reaches the DOM. A string left behind in a component
 * shows up there as text the stub cannot account for, which is the only way to
 * hold this seam that does not rely on someone remembering.
 */

/**
 * A template placeholder, filled by `fill`.
 *
 * Grammar belongs to the catalogue, not to the view. `No traffic {noun}.`
 * keeps the sentence in one string a translator can reorder; assembling it
 * from `'No traffic ' + noun + '.'` in the component puts English word order
 * back in the view, which is the thing being taken out of it.
 */
const PLACEHOLDER = /\{(\w+)\}/g;

/** A catalogue string with its placeholders replaced. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replaceAll(PLACEHOLDER, (whole, name: string) => {
    const value = values[name];
    return value === undefined ? whole : String(value);
  });
}

/** What the frame and the copy control say. */
export interface ShellChromeContent {
  /** The resting label on a copy button. */
  copy: string;
  /** What it says for a moment after copying. */
  copied: string;
}

/** What the usage report says. */
export interface ShellUsageContent {
  title: string;
  description: string;
  /** The accessible name of the period switch. */
  periodLabel: string;
  /** What each period is called on its button, and in a sentence. */
  periods: Record<UsagePeriod, { label: string; noun: string }>;
  /** `{noun}` is the period, as `USAGE_PERIODS` words it. */
  empty: string;
  /** `{period}`, `{tokens}`, `{requests}`, `{models}`, `{providers}`. */
  summary: string;
  /** Appended to the summary when the period cost something. `{cost}`. */
  summaryCost: string;
  proportion: string;
  byProvider: string;
  byModel: string;
  perModel: string;
  recent: string;
  /** `{count}` requests, beside a breakdown bar. */
  requestCount: string;
  /** Marks a breakdown row the provider bills differently. */
  premium: string;
  bands: { input: string; output: string; cache: string };
  counters: {
    input: string;
    output: string;
    cachedInput: string;
    cachedOutput: string;
    total: string;
  };
  columns: {
    model: string;
    tokens: string;
    input: string;
    output: string;
    requests: string;
    cost: string;
    when: string;
    provider: string;
    endpoint: string;
    total: string;
  };
}

/** What the model catalogue says. */
export interface ShellModelsContent {
  title: string;
  description: string;
  empty: string;
  refresh: string;
  refreshing: string;
  /** `{when}` is the relative time. */
  updated: string;
  neverLoaded: string;
  preview: string;
  context: string;
  maxOutput: string;
  /** The heading over each group, keyed by the kind the provider reports. */
  kinds: Record<string, string>;
}

/** What the API keys surface says. */
export interface ShellApiKeysContent {
  title: string;
  description: string;
  endpointTitle: string;
  endpointDescription: string;
  baseUrl: string;
  key: string;
  connectionsTitle: string;
  connectionsDescription: string;
  empty: string;
  addLabel: string;
  addHint: string;
  addPlaceholder: string;
  add: string;
  done: string;
  on: string;
  off: string;
  /** `{name}` is the client's label. */
  remove: string;
  /** `{name}` is the field the secret belongs to. */
  reveal: string;
  hide: string;
  /** What a copy button on the endpoint URL says it is copying. */
  baseUrlAbout: string;
  /** How a secret names itself in an accessible label. */
  endpointKeyName: string;
  /** `{name}` is the connection's label. */
  clientKeyName: string;
}

/** What the application toggles say. */
export interface ShellAppsContent {
  title: string;
  description: string;
  /** The paragraph under the heading, saying what a toggle does. */
  intro: string;
  /** `{name}` is the application. Shown above the command to run. */
  installHint: string;
  empty: string;
  rescan: string;
  done: string;
  on: string;
  off: string;
  copyCommand: string;
  /** Leads the reason a toggle was refused. */
  conflict: string;
  /** What each state of an integration is called. */
  statuses: Record<AppStatus, string>;
}

/** What the diagnostics report says. */
export interface ShellDiagnosticsContent {
  title: string;
  description: string;
  empty: string;
  copyReport: string;
  revealConfiguration: string;
  logsTitle: string;
  logsDescription: string;
  folder: string;
  retention: string;
  /** `{days}` is the retention window. */
  retentionValue: string;
  revealLogs: string;
}

/** Everything the exported surfaces say. */
export interface ShellContent {
  chrome: ShellChromeContent;
  usage: ShellUsageContent;
  models: ShellModelsContent;
  apiKeys: ShellApiKeysContent;
  apps: ShellAppsContent;
  diagnostics: ShellDiagnosticsContent;
}

/**
 * The catalogue this package ships, in English.
 *
 * Data rather than a literal in a view: a consumer imports it, spreads what
 * they keep, and replaces what they do not. Every string that used to be
 * inside a component is here and nowhere else.
 */
export const SHELL_CONTENT: ShellContent = {
  chrome: {
    copy: 'Copy',
    copied: 'Copied',
  },
  usage: {
    title: 'Usage',
    description: 'Token traffic across the models and providers this shell talks to.',
    periodLabel: 'Period',
    periods: {
      day: { label: 'Today', noun: 'today' },
      week: { label: '7 days', noun: 'the last 7 days' },
      month: { label: 'This month', noun: 'this month' },
      all: { label: 'All time', noun: 'all time' },
    },
    empty: 'No traffic {noun}.',
    summary:
      '{period}: {tokens} tokens across {requests} requests to {models} models via {providers} providers',
    summaryCost: ' · {cost}',
    proportion: 'Where it went',
    byProvider: 'By provider',
    byModel: 'By model',
    perModel: 'Per-model detail',
    recent: 'Recent requests',
    requestCount: '{count} req',
    premium: 'premium',
    bands: { input: 'Input', output: 'Output', cache: 'Cache' },
    counters: {
      input: 'Input',
      output: 'Output',
      cachedInput: 'Cached input',
      cachedOutput: 'Cached output',
      total: 'Total',
    },
    columns: {
      model: 'Model',
      tokens: 'Tokens',
      input: 'Input',
      output: 'Output',
      requests: 'Requests',
      cost: 'Cost',
      when: 'When',
      provider: 'Provider',
      endpoint: 'Endpoint',
      total: 'Total',
    },
  },
  models: {
    title: 'Model cards',
    description:
      'Models available to applications through this shell, grouped by kind. The list comes from the provider.',
    empty: 'No models cached yet.',
    refresh: 'Refresh',
    refreshing: 'Refreshing…',
    updated: 'Updated {when}',
    neverLoaded: 'Not loaded yet',
    preview: 'Preview',
    context: 'Context',
    maxOutput: 'Max out',
    kinds: { chat: 'Chat models', embeddings: 'Embeddings' },
  },
  apiKeys: {
    title: 'API keys',
    description: 'The endpoint applications call, and the keys that identify them.',
    endpointTitle: 'Endpoint',
    endpointDescription: 'What an application points at.',
    baseUrl: 'Base URL',
    key: 'Key',
    connectionsTitle: 'Connections',
    connectionsDescription:
      'One key per tool, so they can be told apart. Anything not listed still works.',
    empty: 'Nothing here yet. Add a connection for each application you want to recognise.',
    addLabel: 'What is this connection for?',
    addHint: 'A name you will recognise later.',
    addPlaceholder: 'e.g. Claude Code, Cursor, Raycast',
    add: 'Add',
    done: 'Done',
    on: 'On',
    off: 'Off',
    remove: 'Remove {name}',
    reveal: 'Reveal {name}',
    hide: 'Hide {name}',
    baseUrlAbout: 'the base URL',
    endpointKeyName: 'the endpoint key',
    clientKeyName: 'the {name} key',
  },
  apps: {
    title: 'Apps',
    description: 'Which applications route through this shell.',
    intro:
      'Turn one on and it sends its requests here. Turning one off leaves its own settings exactly as they were.',
    installHint: 'Run this to install {name}, then scan again.',
    empty: 'No applications detected.',
    rescan: 'Scan again',
    done: 'Done',
    on: 'On',
    off: 'Off',
    copyCommand: 'Copy command',
    conflict: 'Left your existing setting in place.',
    statuses: {
      ready: 'Ready',
      'not-installed': 'Not installed',
      'coming-soon': 'Coming soon',
    },
  },
  diagnostics: {
    title: 'Logs and diagnostics',
    description: 'What this build is, what it is talking to, and where it writes its logs.',
    empty: 'Nothing to report yet.',
    copyReport: 'Copy report',
    revealConfiguration: 'Reveal configuration',
    logsTitle: 'Log files',
    logsDescription:
      'One file per day, written as requests are handled. Reveal the folder to read them, or follow the current one with `tail -F`.',
    folder: 'Folder',
    retention: 'Retention',
    retentionValue: '{days} days, then deleted on the next start',
    revealLogs: 'Reveal logs',
  },
};

/**
 * The catalogue in force, defaulting to the shipped one.
 *
 * A context rather than a prop on every component, for the reason every
 * i18n library reaches the same conclusion: copy is ambient. Threading a
 * `content` prop through `Usage` to `Breakdown` to `Bands` would put the
 * catalogue in the signature of components that say two words each, and a
 * consumer would have to pass it at every call site or silently get the
 * default at some of them.
 */
export const ShellContentContext = createContext<ShellContent>(SHELL_CONTENT);

/**
 * Supplies the catalogue to everything below it.
 *
 * `createElement` rather than JSX so this module stays `.ts`: it is imported
 * by every surface that says a word, and a `.tsx` here would be the only
 * reason several of them compile as one.
 */
export function ShellContentProvider({
  content,
  children,
}: {
  content: ShellContent;
  children: ReactNode;
}) {
  return createElement(ShellContentContext.Provider, { value: content }, children);
}

/** The catalogue a surface should draw itself with. */
export function useShellContent(): ShellContent {
  return useContext(ShellContentContext);
}
