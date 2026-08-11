import type { RendererApi } from '../../shared/ipc.js';

/**
 * Whether the preload bridge is there, and what to use when it is not.
 *
 * The renderer used to read `window.stuffbucket` at module scope and hand it
 * straight out. Any component that imported it therefore threw on *import*
 * rather than on use, so the whole tree was unloadable outside Electron. That
 * is not a theoretical problem: adding Storybook meant injecting a stub in
 * `preview-head.html` as a classic script, ahead of the module graph, because
 * four components crashed before a single one rendered.
 *
 * Kept separate from `bridge.ts` and given a host argument so it can be tested
 * without a DOM.
 */

export interface Resolved {
  bridge: RendererApi;
  /** False in a plain browser: no preload ran, so there is no main process. */
  present: boolean;
}

const ABSENT =
  'No preload bridge on this page. The renderer is running outside its host, ' +
  'so anything needing the main process is unavailable.';

/**
 * The stand-in.
 *
 * `invoke` rejects rather than resolving undefined, because a caller that gets
 * `undefined` where it expected preferences will render something wrong and
 * say nothing. A rejection names the reason. `on` returns a working
 * unsubscribe, because no event will ever arrive and a caller unsubscribing
 * from nothing should not have to know that.
 */
function absent(): RendererApi {
  return {
    invoke: () => Promise.reject(new Error(ABSENT)),
    on: () => () => undefined,
  } as RendererApi;
}

/** Whether a value looks like the API the preload exposes. */
function isBridge(candidate: unknown): candidate is RendererApi {
  if (typeof candidate !== 'object' || candidate === null) return false;
  const api = candidate as Partial<RendererApi>;
  return typeof api.invoke === 'function' && typeof api.on === 'function';
}

export function resolveBridge(candidate: unknown): Resolved {
  if (isBridge(candidate)) return { bridge: candidate, present: true };
  return { bridge: absent(), present: false };
}
