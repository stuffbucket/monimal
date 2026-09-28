/** Renders an unknown thrown value as user-facing text without ever showing
 *  "[object Object]" — the common failure mode of `String(caughtValue)`. */
export function describeError(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause)
}