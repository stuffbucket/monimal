import { createContext } from 'react';

/**
 * The element every rule in this package is scoped under.
 *
 * Two things need it and neither may own it. A portalled surface mounts into
 * it, because a Radix portal defaults to `document.body`, which is outside the
 * scope and therefore outside every rule. A carried stylesheet injects into
 * *its* document, because a second window shares this module and does not
 * share a `<head>`.
 *
 * It lived in `components/controls/Overlays.tsx` and could not stay there:
 * that module imports three Radix packages, and `lib/component-styles.ts` is
 * imported by every component that draws itself. Reaching the context through
 * it would have put the dialog primitive in the graph of a button.
 */

/**
 * The shell root, or `null` for the one render before `ShellLayout`'s root
 * element attaches. `undefined` means no shell above this component at all,
 * which is what a consumer rendering a single surface on its own looks like.
 */
export const ShellRoot = createContext<HTMLElement | null | undefined>(undefined);

/** The class every rule in the shipped stylesheet is scoped under. */
export const SHELL_ROOT_CLASS = 'sb-shell';
