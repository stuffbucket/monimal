import consumerCss from './consumer.css?inline';
import shellCss from '../src/renderer/styles/shell.css?inline';
import structuralCss from '../src/renderer/styles/structural.css?inline';
import tokensCss from '../src/renderer/styles/tokens.css?inline';

/**
 * Which stylesheet a story is drawn with.
 *
 * `app` is `shell.css`, the stylesheet this application builds: one palette,
 * every selector unscoped. `package` is `structural.css`, the file copied to
 * `dist/renderer/styles.css` and the only CSS a consumer installs: no palette,
 * every rule under `.sb-shell`.
 *
 * The two are mutually exclusive rather than layered, and that is the reason
 * there is no side-by-side view. `shell.css` matches `.chip` anywhere in the
 * document, including inside a `.sb-shell`, so a package pane sharing a
 * document with an application pane would be drawn by both files and would
 * show the application's colours — the exact confusion this mode exists to
 * remove. Storybook puts the global in the URL, so two documents side by side
 * is two browser windows on the same story with `&globals=shell:app` and
 * `&globals=shell:package`.
 */
export const SHELL_MODES = ['app', 'package'] as const;

export type ShellMode = (typeof SHELL_MODES)[number];

/** The class every rule in the shipped stylesheet is scoped under. */
const SHELL_ROOT_CLASS = 'sb-shell';

const ELEMENT_ID = 'sb-shell-mode';

/*
 * `tokens.css` sets custom properties on `:root` and draws nothing: it has no
 * selector that can style a component. It is the consumer's design system in
 * this arrangement, which is why the package mode may read it and why
 * `controls.css` — sixteen `data-status` rules and every control's appearance —
 * may not.
 */
const STYLESHEETS: Record<ShellMode, string> = {
  app: shellCss,
  package: [tokensCss, consumerCss, structuralCss].join('\n'),
};

/**
 * The element the mode's CSS goes in, first in `head`.
 *
 * First, so `preview.css` beats it whichever way the preview is served. Its
 * `body` rule and `shell.css`'s document reset have the same specificity, and
 * a dev server injects a `<style>` while a built Storybook links a file: only
 * the position in `head` decides both cases the same way.
 */
function styleElement(): HTMLStyleElement {
  const found = document.getElementById(ELEMENT_ID);
  if (found instanceof HTMLStyleElement) return found;

  const created = document.createElement('style');
  created.id = ELEMENT_ID;
  document.head.prepend(created);
  return created;
}

/** Draw every story from this mode's stylesheet. */
export function applyShellMode(mode: ShellMode): void {
  const element = styleElement();
  const css = STYLESHEETS[mode];
  if (element.textContent !== css) element.textContent = css;
}

/**
 * Where the root class goes: on the story's own root element.
 *
 * A consumer puts `.sb-shell` on a container of theirs and composes the
 * exports inside it. `ShellLayout` renders the class itself, so a story that
 * uses it is styled either way; a story that composes `Button` or `Card`
 * directly — which README.md shows — has no `.sb-shell` anywhere and no rule
 * in the shipped stylesheet can reach it.
 *
 * The class goes on `canvasElement` rather than on a wrapper element inside
 * it, for two reasons. `ShellLayout.stories.tsx` asserts that
 * `canvasElement.querySelector('.sb-shell')` is null for the standalone case,
 * and a wrapper would satisfy that selector. And `document.body` would be
 * worse still: a Radix portal defaults to the body, so marking it would style
 * every portalled surface for free and retire the instrument that caught
 * issue #185 on the day it was built.
 */
export function applyShellRoot(mode: ShellMode, element: HTMLElement): void {
  element.classList.toggle(SHELL_ROOT_CLASS, mode === 'package');
}

/**
 * The mode a run starts in.
 *
 * `scripts/storybook-check.mjs` drives the preview by URL and knows nothing
 * about this global, so the environment is how a whole run is put in package
 * mode: `STORYBOOK_SHELL_MODE=package npm run storybook:check`. The toolbar
 * still switches a single story either way.
 */
export function initialShellMode(): ShellMode {
  const requested = import.meta.env['STORYBOOK_SHELL_MODE'] as string | undefined;
  return requested === 'package' ? 'package' : 'app';
}
