// Shared handling for `account_login`'s failure sentinel. The wire contract
// sets it to the literal string `"unknown"` when sign-in succeeded but the
// GitHub user could not be fetched, and expects the renderer to substitute
// copy for it. That is an obligation, not an edge case a surface may skip.

const UNKNOWN_ACCOUNT_LOGIN = 'unknown'

/** Maps the `"unknown"` sentinel to user-facing copy that doesn't read as a
 *  real (if oddly-named) GitHub handle. Any other value passes through
 *  unchanged. */
export function displayAccountLogin(login: string): string {
  return login === UNKNOWN_ACCOUNT_LOGIN ? 'your GitHub account' : login
}
