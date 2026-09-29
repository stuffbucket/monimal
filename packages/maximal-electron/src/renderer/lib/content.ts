import {
  createContext,
  createElement,
  useContext,
  type ReactNode,
} from 'react';

/**
 * The words a surface says, held outside the surface that says them.
 *
 * Reusable components cannot fix a product's language or voice in their
 * source. Doing so puts the thing a consumer is most certain to want to
 * change in the one place they cannot reach: the view.
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
export function fill(
  template: string,
  values: Record<string, string | number>,
): string {
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

/** What the model catalogue says. */
export interface ShellModelsContent {
  empty: string;
  preview: string;
  disabled: string;
  /** `{provider}` is the provider name. */
  provider: string;
  context: string;
  maxOutput: string;
  model: string;
  capabilities: string;
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

/** Everything the exported surfaces say. */
export interface ShellContent {
  chrome: ShellChromeContent;
  models: ShellModelsContent;
  apiKeys: ShellApiKeysContent;
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
  models: {
    empty: 'No models cached yet.',
    preview: 'Preview',
    disabled: 'Disabled',
    provider: 'Provider: {provider}',
    context: 'Context',
    maxOutput: 'Max out',
    model: 'Model',
    capabilities: 'Capabilities',
    kinds: { chat: 'Chat models', embeddings: 'Embeddings' },
  },
  apiKeys: {
    title: 'API keys',
    description:
      'The endpoint applications call, and the keys that identify them.',
    endpointTitle: 'Endpoint',
    endpointDescription: 'What an application points at.',
    baseUrl: 'Base URL',
    key: 'Key',
    connectionsTitle: 'Connections',
    connectionsDescription:
      'One key per tool, so they can be told apart. Anything not listed still works.',
    empty:
      'Nothing here yet. Add a connection for each application you want to recognise.',
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
};

/**
 * The catalogue in force, defaulting to the shipped one.
 *
 * A context rather than a prop on every component, for the reason every
 * i18n library reaches the same conclusion: copy is ambient. Threading a
 * `content` prop through every composed control would put the catalogue in
 * signatures that otherwise have no product-language concern, and a consumer
 * would have to pass it at every call site or silently get mixed defaults.
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
  return createElement(
    ShellContentContext.Provider,
    { value: content },
    children,
  );
}

/** The catalogue a surface should draw itself with. */
export function useShellContent(): ShellContent {
  return useContext(ShellContentContext);
}
