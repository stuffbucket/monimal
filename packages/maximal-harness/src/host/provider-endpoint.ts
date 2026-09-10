/**
 * Which backend the overlay agent talks to, and where it is.
 *
 * Discovery is local by construction: `docs/agent.md` ranks the backends and
 * never asks for a key. Two environment variables narrow that, and neither can
 * widen it.
 *
 * `STUFFBUCKET_PROVIDER` pins one backend. `STUFFBUCKET_PROVIDER_URL` moves the
 * pinned backend's base URL, and is read **only when the pin names a backend
 * that has one**, so a value left in an environment on its own changes nothing.
 * The address has to be http or https on a loopback host, which is the
 * constraint discovery already carried as an assumption.
 *
 * Neither variable reaches the approval gate. `beforeToolCall` runs against
 * whatever answered, so moving an endpoint cannot make a tool call skip it.
 *
 * The backend names live in `agent.ts`, which owns the chain. This module takes
 * them as data: it imports nothing from `electron`, so it is on the
 * `stryker.conf.json` mutate list, and it names no provider.
 */

/** Base URLs, keyed by whatever the caller calls its backends. */
export type Endpoints<K extends string> = Readonly<Record<K, string>>;

/** The backend `pin` names, or undefined when it names none of them. */
export function pinnedKey<K extends string>(
  defaults: Endpoints<K>,
  pin: string,
): K | undefined {
  const keys = Object.keys(defaults) as K[];
  return keys.find((key) => key === pin);
}

/** Hosts that cannot leave the machine. `new URL` keeps the brackets on IPv6. */
const LOOPBACK = ['localhost', '127.0.0.1', '[::1]'];

/**
 * `value` as a base URL, or undefined when it is not a loopback HTTP address.
 *
 * Anything unparseable, remote, or on another scheme is refused rather than
 * repaired. A misspelled address that quietly fell back to the default would
 * look exactly like a working one.
 */
export function loopbackBaseUrl(value: string): string | undefined {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return undefined;
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined;
  if (!LOOPBACK.includes(url.hostname)) return undefined;
  return url.origin;
}

/**
 * `defaults`, with the pinned backend moved to `address`.
 *
 * An address with no pin is ignored: moving discovery has to be asked for
 * twice, once to name the backend and once to say where it is. A pin naming a
 * backend that has no endpoint — the embedded model runs in this process — is
 * not a key of `defaults`, so it moves nothing.
 */
export function resolveEndpoints<K extends string>(
  defaults: Endpoints<K>,
  pin: string,
  address: string,
): Endpoints<K> {
  const key = pinnedKey(defaults, pin);
  if (key === undefined) return { ...defaults };

  const base = loopbackBaseUrl(address);
  if (base === undefined) return { ...defaults };

  return { ...defaults, [key]: base };
}
