const APP_FRAME_CSS = `
.sb-shell .activity-rail {
  position: relative;
}

.sb-shell .activity-rail [data-testid='workspace-rail'] {
  box-sizing: border-box;
  padding-bottom: 5.5rem;
}

.sb-shell .workspace-workbar__lower-left {
  position: absolute;
  z-index: 1;
  bottom: 2.5rem;
  left: 0;
  display: flex;
  width: 64px;
  flex-direction: column;
  gap: var(--shell-space-1, 4px);
  align-items: center;
}

.sb-shell .workspace-workbar__settings > svg {
  width: var(--shell-icon-size, 16px);
  height: var(--shell-icon-size, 16px);
}

.sb-shell .workspace-workbar__settings[data-active='true'] {
  color: var(--shell-accent);
  background: transparent;
}

.sb-shell .workspace-workbar__destinations .nav__item[aria-current='true'] {
  color: var(--maximal-workbar-selection-text, var(--shell-accent));
  background: var(--maximal-workbar-selection, var(--shell-accent-muted));
}

.sb-shell .workspace-workbar__status-spacer {
  flex: 1;
}

.sb-shell .workspace-workbar__assistant {
  width: 24px;
  height: 24px;
  margin: calc(-1 * var(--shell-space-1, 4px)) 0;
}

.sb-shell .workspace-workbar__destinations {
  display: contents;
}

.sb-shell .workspace-workbar__context-menu {
  min-width: 13rem;
}

.sb-shell .workspace-workbar__menu-check {
  display: inline-flex;
  width: var(--shell-icon-size-small, 14px);
  height: var(--shell-icon-size-small, 14px);
  align-items: center;
  justify-content: center;
}

.sb-shell .workspace-surface {
  padding: var(--shell-space-5, 24px);
}

.sb-shell .workspace-surface__header h1,
.sb-shell .workspace-surface__header p {
  margin: 0;
}

.sb-shell .workspace-surface__header h1 {
  font-size: var(--shell-text-xl);
  font-weight: var(--shell-weight-lg);
}

.sb-shell .workspace-surface__header p {
  margin-top: var(--shell-space-1, 4px);
  color: var(--shell-text-muted);
  font-size: var(--shell-text-sm);
}

.sb-shell .workspace-map {
  position: relative;
  display: flex;
  flex: 1;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  background: rgb(227 227 255);
}

.sb-shell .workspace-map__canvas {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: grab;
  touch-action: none;
}

.sb-shell .workspace-map__canvas:active {
  cursor: grabbing;
}

.sb-shell .workspace-map__label {
  position: absolute;
  top: var(--shell-space-3, 12px);
  left: var(--shell-space-3, 12px);
  display: grid;
  gap: 2px;
  padding: var(--shell-space-2, 8px);
  border-radius: var(--shell-radius, 4px);
  color: rgb(38 38 68);
  background: rgb(247 247 255 / 82%);
  box-shadow: 0 4px 14px rgb(67 67 108 / 12%);
  pointer-events: none;
}

.sb-shell .workspace-map__label strong {
  font-size: var(--shell-text-sm);
  font-weight: var(--shell-weight-lg);
}

.sb-shell .workspace-map__label span {
  color: rgb(83 83 120);
  font-size: var(--shell-text-xs);
  font-variant-numeric: tabular-nums;
}
`

const APP_FRAME_STYLE_ID = 'maximal-app-frame'

export function ensureAppFrameStyles(): void {
  if (
    typeof document === 'undefined'
    || document.getElementById(APP_FRAME_STYLE_ID) !== null
  ) return
  const style = document.createElement('style')
  style.id = APP_FRAME_STYLE_ID
  style.textContent = APP_FRAME_CSS
  document.head.appendChild(style)
}
