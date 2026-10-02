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
  color: var(--shell-accent);
  background: var(--shell-accent-muted);
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
  width: var(--shell-icon-size, 16px);
  height: var(--shell-icon-size, 16px);
  align-items: center;
  justify-content: center;
}

.sb-shell .workspace-surface {
  box-sizing: border-box;
  flex: 1;
  min-height: 0;
  overflow: auto;
  padding: var(--shell-space-5, 24px);
}

.sb-shell .workspace-surface__header h1,
.sb-shell .workspace-surface__header p {
  margin: 0;
}

.sb-shell .workspace-surface__actions {
  display: flex;
  flex-wrap: wrap;
  gap: var(--shell-space-2, 8px);
}

.sb-shell .workspace-surface > .workspace-surface__actions {
  margin: var(--shell-space-4, 16px) 0;
}

.sb-shell .workspace-surface h2 {
  font-size: var(--shell-text-lg);
  font-weight: var(--shell-weight-lg);
}

.sb-shell .workspace-surface__list {
  display: grid;
  gap: var(--shell-space-2, 8px);
  padding: 0;
  margin: 0;
  list-style: none;
}

.sb-shell .workspace-surface__entry {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--shell-space-3, 12px);
  padding: var(--shell-space-3, 12px);
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius, 4px);
}

.sb-shell .workspace-surface__copy {
  display: grid;
  flex: 1;
  min-width: 0;
  gap: var(--shell-space-1, 4px);
}

.sb-shell .workspace-surface__detail {
  color: var(--shell-text-muted);
  font-size: var(--shell-text-sm);
  overflow-wrap: anywhere;
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
