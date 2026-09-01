/**
 * Document-level rules.
 *
 * A sibling of `theme.ts` rather than part of it: that file is the one place
 * the `--shell-*` values live, and mixing layout rules into it would give it
 * two jobs. This file uses those values and defines none.
 *
 * Everything here applies OUTSIDE the shell frame. The frame supplies its own
 * type and colour, so these rules matter for the moments when it is not the
 * thing on screen — the document before the app mounts, and anything rendered
 * outside it, such as an error boundary. Getting them wrong is not cosmetic:
 * light text on the browser's default white canvas is near-invisible, and a
 * missing `font-family` falls back to a serif nothing else in the app uses.
 *
 * Imported from `main.tsx` immediately after `./theme`, so the tokens these
 * read already exist.
 */

const BASE_CSS = `
html,
body,
#root {
  height: 100%;
  margin: 0;
}

html,
body {
  color: var(--shell-text);
  background: var(--shell-background);
  font: var(--shell-font);
}
`

const BASE_STYLE_ID = 'maximal-base'

if (typeof document !== 'undefined' && !document.getElementById(BASE_STYLE_ID)) {
  const style = document.createElement('style')
  style.id = BASE_STYLE_ID
  style.textContent = BASE_CSS
  document.head.appendChild(style)
}
