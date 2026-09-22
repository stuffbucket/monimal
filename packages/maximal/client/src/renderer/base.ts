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

.renderer-failure {
  display: grid;
  min-height: 100%;
  place-items: center;
  padding: 32px;
  box-sizing: border-box;
}

.renderer-failure__panel {
  width: min(520px, 100%);
}

.renderer-failure__panel h1 {
  margin: 0 0 12px;
  font-size: 20px;
}

.renderer-failure__panel p {
  margin: 0 0 20px;
  color: var(--shell-text-muted);
  line-height: 1.5;
}

.renderer-failure__panel button {
  padding: 8px 14px;
  color: var(--shell-accent-contrast);
  background: var(--shell-accent);
  border: 0;
  border-radius: var(--shell-radius);
  font: inherit;
  cursor: pointer;
}

.renderer-failure__panel button:focus-visible {
  outline: 2px solid var(--shell-focus);
  outline-offset: 2px;
}
`

const BASE_STYLE_ID = 'maximal-base'

if (typeof document !== 'undefined' && !document.getElementById(BASE_STYLE_ID)) {
  const style = document.createElement('style')
  style.id = BASE_STYLE_ID
  style.textContent = BASE_CSS
  document.head.appendChild(style)
}
