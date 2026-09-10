/**
 * What the overlay does when a key or a click asks it to go away.
 *
 * Pulled out of the component because it is the part that can be wrong, and
 * the tests that used to cover it need a running local model — so they do not
 * run in CI, and they did not run while this was being changed. A three-way
 * decision that nothing could check was the risk in moving these rules onto a
 * dialog's callbacks.
 *
 * The order is the point. Answer the question in front of the user first, then
 * stop the run underneath it, and only dismiss when there is nothing else to
 * do. Escape that dismissed while a tool call was pending would park the run
 * until its timeout, and every summon in that window would report the agent as
 * busy.
 */

export type OverlayDismissal =
  /** A tool call is pending. Say no to it and stay. */
  | 'deny'
  /** An answer is streaming. Stop it and stay. */
  | 'abort'
  /** Nothing is happening. Close the window. */
  | 'hide';

export function escapeAction(pending: boolean, busy: boolean): OverlayDismissal {
  if (pending) return 'deny';
  if (busy) return 'abort';
  return 'hide';
}

/**
 * A click outside the card always dismisses, and answers a pending question on
 * the way out for the same reason `escapeAction` does.
 */
export function outsideAction(pending: boolean): OverlayDismissal[] {
  return pending ? ['deny', 'hide'] : ['hide'];
}
