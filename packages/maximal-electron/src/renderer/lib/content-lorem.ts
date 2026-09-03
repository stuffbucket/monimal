import type { ShellContent } from './content.js';

/**
 * The catalogue as a stub, in lorem ipsum.
 *
 * Two jobs, and the second is the one that matters.
 *
 * A consumer building a surface before the copy exists renders against this
 * and gets shape without pretending the words are decided. That is the ordinary
 * use, and it is why this is exported rather than kept in the test tree.
 *
 * The other job is enforcement. `tests/content-seam.test.ts` renders every
 * exported surface under this catalogue and fails on any English that still
 * reaches the DOM. A string a component kept for itself cannot be accounted
 * for by a catalogue that says none of it, so it shows up as text nothing
 * here can explain — which is the only check that holds this seam without
 * relying on whoever adds the next surface remembering the rule.
 *
 * So the words are deliberately not English words. `Lorem` and `ipsum` are
 * fine; `Total` and `Copy` are not, however placeholder they feel, because the
 * check cannot tell those from the ones that were left behind.
 *
 * Placeholders are kept. `{noun}` in the shipped string is `{noun}` here, or
 * the value the view passes disappears and the test reads a sentence that
 * cannot have come from the data.
 */
export const LOREM_CONTENT: ShellContent = {
  chrome: {
    copy: 'Lorem',
    copied: 'Ipsum',
  },
  usage: {
    title: 'Lorem ipsum',
    description: 'Dolor sit amet, consectetur adipiscing elit, sed do eiusmod tempor.',
    periodLabel: 'Tempora',
    periods: {
      day: { label: 'Hodie', noun: 'hodie' },
      week: { label: 'Septem', noun: 'septem dies' },
      month: { label: 'Mensis', noun: 'hoc mense' },
      all: { label: 'Omnia', noun: 'omni tempore' },
    },
    empty: 'Nulla {noun}.',
    summary: '{period}: {tokens} incididunt {requests} labore {models} magna {providers} aliqua',
    summaryCost: ' · {cost}',
    proportion: 'Consectetur',
    byProvider: 'Adipiscing elit',
    byModel: 'Sed eiusmod',
    perModel: 'Tempor incididunt',
    recent: 'Ut labore',
    requestCount: '{count} dolore',
    premium: 'sequi',
    bands: { input: 'Aliqua', output: 'Enim', cache: 'Minim' },
    counters: {
      input: 'Aliqua',
      output: 'Enim',
      cachedInput: 'Veniam quis',
      cachedOutput: 'Nostrud exerc',
      total: 'Ullamco',
    },
    columns: {
      model: 'Laboris',
      tokens: 'Nisi',
      input: 'Aliquip',
      output: 'Commodo',
      requests: 'Consequat',
      cost: 'Duis',
      when: 'Aute',
      provider: 'Irure',
      endpoint: 'Reprehenderit',
      total: 'Voluptate',
    },
  },
  models: {
    title: 'Velit esse',
    description: 'Cillum dolore eu fugiat nulla pariatur, excepteur sint occaecat cupidatat.',
    empty: 'Non proident sunt in culpa.',
    refresh: 'Officia',
    refreshing: 'Deserunt…',
    updated: 'Mollit {when}',
    neverLoaded: 'Anim id est',
    preview: 'Laborum',
    context: 'Perspiciatis',
    maxOutput: 'Unde omnis',
    kinds: { chat: 'Iste natus', embeddings: 'Voluptatem' },
  },
  apiKeys: {
    title: 'Accusantium',
    description: 'Doloremque laudantium, totam rem aperiam eaque ipsa quae ab illo.',
    endpointTitle: 'Inventore',
    endpointDescription: 'Veritatis et quasi architecto beatae.',
    baseUrl: 'Vitae dicta',
    key: 'Sunt explicabo',
    connectionsTitle: 'Nemo enim',
    connectionsDescription: 'Ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit.',
    empty: 'Sed quia consequuntur magni dolores eos qui ratione.',
    addLabel: 'Voluptatem sequi nesciunt?',
    addHint: 'Neque porro quisquam est.',
    addPlaceholder: 'e.g. Qui dolorem, Adipisci velit, Sed quia',
    add: 'Numquam',
    done: 'Eius modi',
    on: 'Tempora',
    off: 'Incidunt',
    remove: 'Magnam {name}',
    reveal: 'Quaerat {name}',
    hide: 'Voluptatem {name}',
    baseUrlAbout: 'dolorem eum',
    endpointKeyName: 'fugiat quo',
    clientKeyName: 'voluptas {name}',
  },
  apps: {
    title: 'Aliquam',
    description: 'Quaerat voluptatem ut enim ad minima veniam quis nostrum.',
    intro: 'Nam libero tempore cum soluta nobis est eligendi optio cumque nihil impedit.',
    installHint: 'Quo minus id {name} quod maxime.',
    empty: 'Exercitationem ullam corporis.',
    rescan: 'Suscipit',
    done: 'Laboriosam',
    on: 'Aliquid',
    off: 'Commodi',
    copyCommand: 'Consequatur',
    conflict: 'Quis autem vel eum iure.',
    statuses: {
      ready: 'Voluptate',
      'not-installed': 'Nihil molestiae',
      'coming-soon': 'Quam nihil',
    },
  },
  diagnostics: {
    title: 'Reprehenderit qui',
    description: 'In ea voluptate velit esse quam nihil molestiae consequatur.',
    empty: 'Vel illum qui dolorem.',
    copyReport: 'Eum fugiat',
    revealConfiguration: 'Quo voluptas',
    logsTitle: 'Nulla pariatur',
    logsDescription: 'At vero eos et accusamus et iusto odio dignissimos ducimus qui blanditiis.',
    folder: 'Praesentium',
    retention: 'Voluptatum',
    retentionValue: '{days} corrupti quos dolores et quas molestias',
    revealLogs: 'Deleniti atque',
  },
};
