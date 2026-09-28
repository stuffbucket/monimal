import { TmuxSessionNames } from '../../src/tmux/session-names.js';

/** Session names under the `maximal` prefix, with fixed entropy when given. */
export const tmuxNames = (entropy?: string): TmuxSessionNames =>
  new TmuxSessionNames('maximal', entropy === undefined ? undefined : () => entropy);

/** Session names whose next generated name is exactly `name`. */
export const tmuxNamed = (name: string): TmuxSessionNames => tmuxNames(name.replace(/^maximal-/, ''));
