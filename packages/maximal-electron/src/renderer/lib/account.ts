/**
 * The account seam.
 *
 * The shell owns the surface and none of the account model. It does not know
 * what an identity provider is, where a session lives, or how a sign-in
 * happens. A consumer hands it a name, a handle, an avatar and two callbacks,
 * exactly as `lib/data.ts` says to hand it content and `tokens.css` says to
 * hand it a palette.
 *
 * Nothing here reads storage or the network. That is the point: an `Account`
 * is a value the consumer already has.
 */

/** What the shell shows about who is signed in. */
export interface Account {
  /** Opaque to the shell. Handed back with every callback. */
  id: string;
  /** The name shown in the menu, and the source of the initials. */
  displayName: string;
  /** A second line: an email address, an `@handle`, an organisation. */
  handle?: string;
  /** Shown instead of the initials once it loads. */
  avatarUrl?: string;
  /** A short badge beside the name: a plan, a tier, a role. */
  plan?: string;
}

/** What the avatar shows when a name yields no letters at all. */
export const NO_INITIALS = '?';

/**
 * Up to two letters for the avatar.
 *
 * The first letter of the first word and of the last word, which is what
 * reads as a monogram for both "Ada" and "Ada King Lovelace".
 *
 * Split on a space rather than on `\s+`: a display name is not a document,
 * and the empty-string filter already absorbs runs of spaces, so the simpler
 * separator loses nothing.
 */
export function initials(displayName: string): string {
  const marks = displayName
    .split(' ')
    .filter((word) => word !== '')
    .map((word) => word.slice(0, 1).toUpperCase());

  const chosen =
    marks.length === 1 ? marks : [...marks.slice(0, 1), ...marks.slice(-1)];

  return chosen.join('') || NO_INITIALS;
}

/**
 * The accessible name of the profile button.
 *
 * A signed-out shell still shows the control, because that is where signing in
 * happens. The two states therefore need different names, and an avatar has no
 * visible label to carry the difference.
 */
export function profileLabel(account: Account | undefined): string {
  return `Account: ${account === undefined ? 'not signed in' : account.displayName}`;
}
