/**
 * URL safety, kept free of Electron imports so it can be unit tested.
 *
 * `shell:open-external` hands a URL to the operating system. Without this
 * check, that channel is an arbitrary command surface: `file:` opens local
 * paths, and a registered custom protocol can launch another application with
 * attacker-chosen arguments.
 */

/** The only schemes allowed to leave the application. */
const SAFE_PROTOCOLS = new Set(['http:', 'https:', 'mailto:']);

export function isSafeExternalUrl(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    // Not a URL at all. Refuse rather than guess.
    return false;
  }
  return SAFE_PROTOCOLS.has(url.protocol);
}
