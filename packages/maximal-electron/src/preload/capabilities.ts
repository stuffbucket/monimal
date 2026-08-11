/**
 * The generic bridge, as pure functions over an injected transport.
 *
 * Nothing here imports `electron`, so Stryker reaches it and the whole shape
 * is mutated. `bridge.ts` is the ten lines that cannot be: `contextBridge` and
 * `ipcRenderer`.
 *
 * The channel names below are literals, not an import of this shell's
 * contract. A consumer bundles this module into their own preload and
 * registers these names themselves, so an import of `src/shared/ipc.ts` would
 * put this repository's own application on the export graph. Issue #17.
 * `tests/bridge-capabilities.test.ts` asserts this shell answers every one of
 * them, which is the check the duplication owes.
 */

/** Native powers the bridge can carry. No application concept belongs here. */
export const BRIDGE_CAPABILITIES = ['openExternal', 'versions', 'checkForUpdate'] as const;

export type BridgeCapability = (typeof BRIDGE_CAPABILITIES)[number];

/** The channel each capability calls. A consumer's main process handles these. */
export const CAPABILITY_CHANNELS: Record<BridgeCapability, string> = {
  openExternal: 'shell:open-external',
  versions: 'app:versions',
  checkForUpdate: 'update:check',
};

/**
 * Why a call did not produce a value.
 *
 * `unavailable` is a channel no handler answers, which is a host that declared
 * a capability it does not implement. `refused` is the handler saying no.
 * `failed` is the bridge refusing the call before it left the renderer.
 */
export type BridgeFailure = 'unavailable' | 'refused' | 'failed';

/**
 * The result of every bridge call.
 *
 * **A `catch` on a bridge call never fires.** Nothing here rejects, so
 * `bridge.openExternal(url).catch(report)` reports nothing and the failure is
 * silent. Discriminate on `ok` instead. That is the cost of the design in
 * `docs/embedding.md`, and it is the one mistake a caller ships rather than
 * sees.
 */
export type Envelope<T> =
  | { ok: true; value: T }
  | { ok: false; code: BridgeFailure; message: string };

/** What the host declares its main process implements. */
export interface BridgeDeclaration {
  capabilities?: readonly BridgeCapability[];
  /** An absolute http or https origin the renderer talks to directly. */
  serviceOrigin?: string;
}

export interface BridgeTransport {
  invoke(channel: string, ...args: readonly unknown[]): Promise<unknown>;
}

export interface BridgeMethods {
  openExternal(url: string): Promise<Envelope<void>>;
  versions(): Promise<Envelope<unknown>>;
  checkForUpdate(): Promise<Envelope<unknown>>;
}

/**
 * What lands on the namespaced global.
 *
 * Every method is optional, and a method the host did not declare is absent
 * rather than present and failing. `typeof api.openExternal === 'function'` is
 * the whole feature test; there is no version to compare.
 */
export type Bridge = {
  readonly capabilities: readonly BridgeCapability[];
  readonly serviceOrigin: string | null;
} & Partial<BridgeMethods>;

/** Argument prefixes. `additionalArguments` is how the host declares. */
export const CAPABILITY_ARGUMENT = '--bridge-capability=';
export const ORIGIN_ARGUMENT = '--bridge-origin=';

const NO_HANDLER = 'No handler registered';

/**
 * One spelling of an origin, or null.
 *
 * A scheme other than http or https is refused rather than passed through: the
 * renderer fetches this, and `file:` would make the injection an arbitrary read.
 */
export function normalizeOrigin(raw: string): string | null {
  let parsed: URL;
  try {
    parsed = new URL(raw);
  } catch {
    return null;
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
  const href = parsed.href;
  return href.endsWith('/') ? href.slice(0, -1) : href;
}

/**
 * The declaration, as arguments for `webPreferences.additionalArguments`.
 *
 * Throws rather than dropping an unknown name. A host that misspells a
 * capability would otherwise get a window whose bridge is silently missing a
 * method, which is the failure this whole seam exists to make visible.
 */
export function capabilityArguments(declaration: BridgeDeclaration | undefined): string[] {
  if (declaration === undefined) return [];

  const known = new Set<string>(BRIDGE_CAPABILITIES);
  const named = declaration.capabilities ?? [];
  for (const name of named) {
    if (!known.has(name)) {
      throw new Error(
        `${name} is not a bridge capability. The set is ${BRIDGE_CAPABILITIES.join(', ')}.`,
      );
    }
  }

  const args = [...new Set(named)].map((name) => `${CAPABILITY_ARGUMENT}${name}`);

  const origin = declaration.serviceOrigin;
  if (origin !== undefined) {
    const normalized = normalizeOrigin(origin);
    if (normalized === null) {
      throw new Error(`serviceOrigin must be an absolute http or https URL, and was "${origin}".`);
    }
    args.push(`${ORIGIN_ARGUMENT}${normalized}`);
  }

  return args;
}

/**
 * Capabilities the host declared, in the bridge's own order.
 *
 * Filtering through `BRIDGE_CAPABILITIES` drops a name this build does not
 * know, so a newer host talking to an older bridge loses a method rather than
 * gaining a broken one.
 */
export function declaredCapabilities(argv: readonly string[]): BridgeCapability[] {
  const named = new Set<string>();
  for (const entry of argv) {
    if (entry.startsWith(CAPABILITY_ARGUMENT)) named.add(entry.slice(CAPABILITY_ARGUMENT.length));
  }
  return BRIDGE_CAPABILITIES.filter((name) => named.has(name));
}

/** The origin the host injected, or null. The last argument wins. */
export function declaredOrigin(argv: readonly string[]): string | null {
  let origin: string | null = null;
  for (const entry of argv) {
    if (entry.startsWith(ORIGIN_ARGUMENT)) {
      origin = normalizeOrigin(entry.slice(ORIGIN_ARGUMENT.length));
    }
  }
  return origin;
}

function succeed<T>(value: T): Envelope<T> {
  return { ok: true, value };
}

function fail(code: BridgeFailure, message: string): Envelope<never> {
  return { ok: false, code, message };
}

/** A rejection from `invoke`, as an envelope. */
export function classify(error: unknown): Envelope<never> {
  const message = error instanceof Error ? error.message : String(error);
  return fail(message.includes(NO_HANDLER) ? 'unavailable' : 'refused', message);
}

async function call(
  transport: BridgeTransport,
  channel: string,
  ...args: readonly unknown[]
): Promise<Envelope<unknown>> {
  try {
    return succeed(await transport.invoke(channel, ...args));
  } catch (error) {
    return classify(error);
  }
}

/**
 * The object the preload exposes.
 *
 * No method rejects. A rejection crosses `contextBridge` as a copied `Error`
 * with no class left, so a caller cannot tell "not implemented" from "denied"
 * without reading prose, and a caller who forgets `catch` gets an unhandled
 * rejection that a packaged renderer shows nobody. An envelope is a value the
 * type system makes the caller discriminate.
 */
export function buildBridge(transport: BridgeTransport, argv: readonly string[]): Bridge {
  const capabilities = declaredCapabilities(argv);

  const methods: BridgeMethods = {
    openExternal: (url: string) => {
      if (typeof url !== 'string' || url === '') {
        return Promise.resolve(fail('failed', 'openExternal needs a non-empty URL string.'));
      }
      return call(transport, CAPABILITY_CHANNELS.openExternal, { url }) as Promise<Envelope<void>>;
    },
    versions: () => call(transport, CAPABILITY_CHANNELS.versions),
    checkForUpdate: () => call(transport, CAPABILITY_CHANNELS.checkForUpdate),
  };

  const bridge: Record<string, unknown> = {
    capabilities: Object.freeze([...capabilities]),
    serviceOrigin: declaredOrigin(argv),
  };
  for (const name of capabilities) bridge[name] = methods[name];

  return bridge as Bridge;
}
