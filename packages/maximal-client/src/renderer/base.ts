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

.license-dialog {
  width: min(48rem, calc(100vw - var(--shell-space-5, 24px)));
  max-height: min(44rem, calc(100vh - var(--shell-space-5, 24px)));
}

.license-dialog__reader {
  min-height: 0;
  max-height: min(32rem, calc(100vh - 15rem));
  overflow: auto;
  padding: var(--shell-space-3, 12px);
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius, 6px);
  background: var(--shell-canvas);
}

.license-dialog__text {
  margin: 0;
  overflow-wrap: anywhere;
  color: var(--shell-text);
  font: var(--shell-text-sm, 0.875rem)/1.55 ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: pre-wrap;
}

.license-dialog__actions,
.provider-onboarding__actions {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.provider-onboarding__actions {
  gap: var(--shell-space-2, 8px);
}

.terminal-profile-icon {
  width: 24px;
  height: 24px;
  background-color: var(--terminal-profile-icon-color);
  mask: var(--terminal-profile-icon-mask) center / contain no-repeat;
  -webkit-mask: var(--terminal-profile-icon-mask) center / contain no-repeat;
}

.workspace-map__scrim {
  position: fixed;
  inset: 0;
  pointer-events: none;
}

.workspace-map {
  position: fixed;
  z-index: 50;
  inset: 10vh 7vw;
  display: grid;
  grid-template-rows: 42px minmax(0, 1fr);
  overflow: hidden;
  padding: 0;
  border: 1px solid var(--shell-border);
  border-radius: 10px;
  background: var(--shell-canvas);
  box-shadow: 0 20px 70px rgb(0 0 0 / 45%);
}

.workspace-map__header {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 0 10px;
  border-bottom: 1px solid var(--shell-border);
  background: var(--shell-raised);
}

.workspace-map__header > span:not(.workspace-map__hint) {
  min-width: 38px;
  text-align: center;
  color: var(--shell-text-muted);
  font-size: 11px;
}

.workspace-map__action {
  display: inline-grid;
  width: 26px;
  height: 26px;
  place-items: center;
  padding: 0;
  border: 0;
  border-radius: var(--shell-radius);
  color: var(--shell-text);
  background: transparent;
  cursor: pointer;
}

.workspace-map__action:hover {
  background: var(--shell-hover);
}

.workspace-map__action:focus-visible {
  outline: 2px solid var(--shell-focus);
  outline-offset: -2px;
}

.workspace-map__hint {
  flex: 1;
  color: var(--shell-text-muted);
  font-size: 11px;
}

.workspace-map__viewport {
  position: relative;
  overflow: hidden;
  cursor: grab;
  background-color: var(--shell-background);
  background-image: radial-gradient(var(--shell-border) 1px, transparent 1px);
  background-size: 24px 24px;
  touch-action: none;
}

.workspace-map__viewport:active {
  cursor: grabbing;
}

.workspace-map__plane {
  position: absolute;
  width: 4000px;
  height: 3000px;
  transform-origin: 0 0;
}

.workspace-map__edges {
  position: absolute;
  inset: 0;
  overflow: visible;
  pointer-events: none;
}

.workspace-map__edges line {
  stroke: var(--shell-border);
  stroke-width: 2;
  stroke-dasharray: 5 5;
}

.workspace-map__node {
  position: absolute;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  width: 220px;
  min-height: 108px;
  padding: 14px;
  border: 1px solid var(--shell-border);
  border-radius: 9px;
  color: var(--shell-text);
  background: var(--shell-raised);
  box-shadow: 0 8px 24px rgb(0 0 0 / 25%);
  text-align: left;
  cursor: move;
  touch-action: none;
}

.workspace-map__node[data-kind='terminal'] {
  border-color: var(--shell-accent);
}

.workspace-map__node strong,
.workspace-map__node small {
  display: block;
}

.workspace-map__node strong {
  max-width: 160px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.workspace-map__node small {
  margin-top: 6px;
  color: var(--shell-text-muted);
}

:root:is([data-vibrancy='true'], [data-background-effects='true'])
  .sb-shell
  :is(.dialog, .menu, .tooltip, .workspace-map) {
  background-color: var(--maximal-overlay-material);
  background-image: linear-gradient(
    145deg,
    var(--maximal-overlay-highlight),
    transparent 42%
  );
  -webkit-backdrop-filter: blur(28px) saturate(1.25);
  backdrop-filter: blur(28px) saturate(1.25);
}

:root:is([data-vibrancy='true'], [data-background-effects='true'])
  .sb-shell
  .dialog__scrim {
  background: var(--maximal-material-scrim);
  -webkit-backdrop-filter: blur(3px) saturate(0.9);
  backdrop-filter: blur(3px) saturate(0.9);
}

:root[data-reduced-motion='true'] *,
:root[data-reduced-motion='true'] *::before,
:root[data-reduced-motion='true'] *::after {
  scroll-behavior: auto !important;
  transition-duration: 0.01ms !important;
  animation-duration: 0.01ms !important;
  animation-iteration-count: 1 !important;
}

.cozy-background {
  position: fixed;
  inset: 0;
  z-index: 0;
  overflow: hidden;
  pointer-events: none;
  background:
    radial-gradient(ellipse at 12% 22%, rgb(111 154 165 / 0.38), transparent 46%),
    radial-gradient(ellipse at 76% 28%, rgb(154 127 160 / 0.34), transparent 44%),
    radial-gradient(ellipse at 50% 78%, rgb(170 135 106 / 0.32), transparent 48%);
}

.cozy-background canvas {
  display: block;
  width: 100%;
  height: 100%;
  opacity: 1;
}

.cozy-background[data-renderer-available='true'] {
  background: transparent;
}

:root[data-background-effects='true'] .sb-shell {
  z-index: 1;
}

.project-browser {
  width: min(42rem, calc(100vw - var(--shell-space-5, 24px)));
}

.project-browser__results {
  display: grid;
  max-height: min(28rem, calc(100vh - 18rem));
  overflow: auto;
  gap: 2px;
}

.project-browser__result {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  padding: var(--shell-space-3, 12px);
  color: var(--shell-text);
  background: transparent;
  border: 0;
  border-radius: var(--shell-radius, 6px);
  text-align: left;
  cursor: pointer;
}

.project-browser__result:hover:not(:disabled),
.project-browser__result:focus-visible {
  background: var(--shell-hover);
}

.project-browser__result:disabled {
  opacity: 0.62;
  cursor: not-allowed;
}

.project-browser__name {
  font-weight: 600;
}

.project-browser__path,
.project-browser__meta {
  color: var(--shell-text-muted);
  font-size: 0.8rem;
}

.project-browser__path {
  grid-column: 1;
  overflow: hidden;
  text-overflow: ellipsis;
}

.project-browser__meta {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: center;
}

.project-browser__actions,
.project-root-settings {
  display: flex;
  flex-wrap: wrap;
  gap: var(--shell-space-2, 8px);
}

.project-browser__actions {
  justify-content: flex-end;
}

.project-root-settings {
  align-items: end;
}

.project-root-settings__field {
  display: grid;
  min-width: min(24rem, 100%);
  gap: var(--shell-space-1, 4px);
  color: var(--shell-text-muted);
  font-size: 0.8rem;
}
`

const BASE_STYLE_ID = 'maximal-base'

if (
  typeof document !== 'undefined' &&
  !document.getElementById(BASE_STYLE_ID)
) {
  const style = document.createElement('style')
  style.id = BASE_STYLE_ID
  style.textContent = BASE_CSS
  document.head.appendChild(style)
}
