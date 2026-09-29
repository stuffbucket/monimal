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
 * Placeholders are kept so values supplied by a view cannot disappear in the
 * stub without the test noticing.
 */
export const LOREM_CONTENT: ShellContent = {
  chrome: {
    copy: 'Lorem',
    copied: 'Ipsum',
  },
  models: {
    empty: 'Non proident sunt in culpa.',
    preview: 'Laborum',
    context: 'Perspiciatis',
    maxOutput: 'Unde omnis',
    model: 'Laboris',
    capabilities: 'Voluptatem',
    kinds: { chat: 'Iste natus', embeddings: 'Voluptatem' },
  },
  apiKeys: {
    title: 'Accusantium',
    description:
      'Doloremque laudantium, totam rem aperiam eaque ipsa quae ab illo.',
    endpointTitle: 'Inventore',
    endpointDescription: 'Veritatis et quasi architecto beatae.',
    baseUrl: 'Vitae dicta',
    key: 'Sunt explicabo',
    connectionsTitle: 'Nemo enim',
    connectionsDescription:
      'Ipsam voluptatem quia voluptas sit aspernatur aut odit aut fugit.',
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
};
