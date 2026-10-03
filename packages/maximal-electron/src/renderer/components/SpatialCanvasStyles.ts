export const SPATIAL_CANVAS_CURSORS = {
  select: 'default',
  pan: 'grab',
  panning: 'grabbing',
  crosshair: 'crosshair',
  text: 'text',
  resizeColumn: 'col-resize',
  resizeRow: 'row-resize',
  resizeNorthwestSoutheast: 'nwse-resize',
  resizeNortheastSouthwest: 'nesw-resize',
  move: 'move',
  unavailable: 'not-allowed',
  action: 'pointer',
} as const;

export const SPATIAL_CANVAS_STYLES = `
.sb-shell .spatial-canvas-surface__overlay {
  position: fixed;
  inset: 0;
}

.sb-shell .spatial-canvas-surface {
  position: fixed;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  overflow: hidden;
  border: 0;
  border-radius: 0;
  box-shadow: none;
}

.sb-shell .spatial-canvas-surface--embedded {
  position: relative;
  inset: auto;
  flex: 1;
  min-width: 0;
  min-height: 0;
}

.sb-shell .spatial-canvas-surface > .spatial-canvas {
  width: 100%;
  min-height: 0;
  height: 100%;
  border-radius: 0;
}

.sb-shell .spatial-canvas {
  position: relative;
  min-height: min(34rem, 78vh);
  height: min(78vh, 56rem);
  overflow: hidden;
  color: var(--shell-text);
  border: 0;
  border-radius: var(--shell-radius);
  font-size: var(--shell-text-base);
  line-height: var(--shell-leading-base);
  contain: layout paint style;
  isolation: isolate;
}

.sb-shell .spatial-canvas__topbar {
  position: absolute;
  z-index: 8;
  top: var(--shell-space-2);
  right: var(--shell-space-2);
  left: var(--shell-space-2);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--shell-space-4);
  pointer-events: none;
}

.sb-shell .spatial-canvas__topbar > * {
  pointer-events: auto;
}

.sb-shell .spatial-canvas__corner,
.sb-shell .spatial-canvas__presence,
.sb-shell .spatial-canvas__pages,
.sb-shell .spatial-canvas__controls,
.sb-shell .spatial-canvas__zoom {
  display: flex;
  align-items: center;
  gap: var(--shell-space-1);
  padding: var(--shell-space-1);
  background: var(--shell-raised);
  border: 0;
  border-radius: var(--shell-radius);
  box-shadow: none;
}

.sb-shell .spatial-canvas__corner {
  gap: 0;
  padding: var(--shell-space-2);
  background: var(--shell-raised);
  border: 0;
  border-radius: var(--shell-radius-large);
  box-shadow: var(--shell-elevation, none);
  backdrop-filter: none;
}

.sb-shell .spatial-canvas__pages {
  position: relative;
  min-width: 0;
  padding: 0;
  gap: 0;
  overflow: visible;
  background: transparent;
}

.sb-shell .spatial-canvas__project-trigger,
.sb-shell .spatial-canvas__page-trigger,
.sb-shell .spatial-canvas__navigation-row {
  min-width: 0;
  height: var(--shell-control-sm);
  margin: 0;
  padding: 0 var(--shell-space-2);
  color: var(--shell-text);
  background: transparent;
  border: 0;
  border-radius: var(--shell-radius);
  font: inherit;
  outline: none;
  text-align: left;
}

.sb-shell .spatial-canvas__project-trigger,
.sb-shell .spatial-canvas__page-trigger {
  display: flex;
  align-items: center;
  gap: var(--shell-space-2);
}

.sb-shell .spatial-canvas__project-trigger:hover,
.sb-shell .spatial-canvas__project-trigger[aria-expanded="true"],
.sb-shell .spatial-canvas__page-trigger:hover,
.sb-shell .spatial-canvas__page-trigger[aria-expanded="true"],
.sb-shell .spatial-canvas__navigation-row:hover {
  background: var(--shell-hover);
}

.sb-shell .spatial-canvas__project-trigger[data-focused="true"],
.sb-shell .spatial-canvas__page-trigger[data-focused="true"] {
  box-shadow: inset 0 0 0 var(--shell-focus-ring-width) var(--shell-focus, var(--shell-accent));
}

.sb-shell .spatial-canvas__project-title,
.sb-shell .spatial-canvas__page-title {
  max-width: calc(var(--shell-row-height) * 4);
  overflow: hidden;
  color: var(--shell-text);
  font-size: var(--shell-text-sm);
  font-weight: var(--shell-weight-md);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-shell .spatial-canvas__pages-divider {
  width: var(--shell-icon-stroke);
  height: var(--shell-control-sm);
  background: var(--shell-border);
}

.sb-shell .spatial-canvas__page-count {
  position: relative;
  display: grid;
  width: var(--shell-control-sm);
  height: var(--shell-control-sm);
  flex: 0 0 var(--shell-control-sm);
  place-items: center;
  color: var(--shell-text-muted);
}

.sb-shell .spatial-canvas__page-count > svg {
  width: calc(var(--shell-control-sm) - var(--shell-space-2));
  height: calc(var(--shell-control-sm) - var(--shell-space-2));
  overflow: visible;
}

.sb-shell .spatial-canvas__page-count rect {
  fill: var(--shell-raised);
  stroke: currentColor;
  stroke-width: var(--shell-icon-stroke);
  vector-effect: non-scaling-stroke;
}

.sb-shell .spatial-canvas__page-count-value {
  fill: currentColor;
  font-size: var(--shell-text-xs);
  font-weight: var(--shell-weight-md);
  stroke: none;
  text-anchor: middle;
  dominant-baseline: central;
}

.sb-shell .spatial-canvas__name-input {
  min-width: 0;
  height: var(--shell-control-sm);
  padding: 0 var(--shell-space-2);
  color: var(--shell-text);
  background: var(--shell-canvas);
  border: var(--shell-icon-stroke) solid var(--shell-focus, var(--shell-accent));
  border-radius: var(--shell-radius);
  font: inherit;
  outline: none;
}

.sb-shell .spatial-canvas__name-input--trigger {
  width: calc(var(--shell-row-height) * 4);
  max-width: calc(var(--shell-row-height) * 4);
}

.sb-shell .spatial-canvas__name-input--popover {
  width: 100%;
  max-width: none;
}

.sb-shell .spatial-canvas__pages-popover {
  position: absolute;
  z-index: 14;
  top: calc(100% + var(--shell-space-3));
  left: 0;
  display: grid;
  width: calc(var(--shell-row-height) * 8 + var(--shell-space-2));
  padding: var(--shell-space-2);
  gap: var(--shell-space-2);
  background: var(--shell-raised);
  border: var(--shell-icon-stroke) solid var(--shell-border);
  border-radius: var(--shell-radius-large);
  box-shadow: var(--shell-elevation, none);
}

.sb-shell .spatial-canvas__pages-popover > header,
.sb-shell .spatial-canvas__pages-popover > [role="tablist"],
.sb-shell .spatial-canvas__pages-popover > [role="listbox"] {
  display: flex;
  align-items: center;
  gap: var(--shell-space-1);
}

.sb-shell .spatial-canvas__pages-popover > header {
  justify-content: space-between;
}

.sb-shell .spatial-canvas__pages-popover > [role="tablist"],
.sb-shell .spatial-canvas__pages-popover > [role="listbox"] {
  display: grid;
}

.sb-shell .spatial-canvas__topbar .icon-button,
.sb-shell .spatial-canvas__controls .icon-button,
.sb-shell .spatial-canvas__zoom .icon-button {
  width: var(--shell-control-sm);
  height: var(--shell-control-sm);
}

.sb-shell .spatial-canvas__pages-popover .spatial-canvas__navigation-row {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  width: 100%;
  gap: var(--shell-space-2);
}

.sb-shell .spatial-canvas__pages-popover .spatial-canvas__navigation-row > span:last-child:not(:first-child) {
  margin-left: auto;
  color: var(--shell-text-muted);
}

.sb-shell .spatial-canvas__pages-popover .spatial-canvas__navigation-row[aria-selected="true"] {
  background: var(--shell-active);
}

.sb-shell .spatial-canvas__pages-popover .spatial-canvas__navigation-row[data-dragging="true"] {
  opacity: var(--shell-disabled-opacity, 0.5);
}

.sb-shell .spatial-canvas__avatar {
  display: grid;
  width: var(--shell-control-sm);
  height: var(--shell-control-sm);
  margin-right: calc(-1 * var(--shell-space-2));
  place-items: center;
  color: var(--shell-accent-contrast, var(--shell-text));
  border: var(--shell-icon-stroke) solid var(--shell-raised);
  border-radius: var(--shell-radius-pill);
  font-size: var(--shell-text-xs);
  font-weight: var(--shell-weight-lg);
}

.sb-shell .spatial-canvas__avatar:last-of-type {
  margin-right: var(--shell-space-1);
}

.sb-shell .spatial-canvas__presence .input {
  width: calc(var(--shell-row-height) * 5);
}

.sb-shell .spatial-canvas__controls {
  position: absolute;
  z-index: 9;
  bottom: var(--shell-space-3);
  right: 0;
  left: 0;
  width: max-content;
  margin-inline: auto;
}

.sb-shell .spatial-canvas__controls .icon-button[data-active="true"],
.sb-shell .spatial-canvas__presence .icon-button[data-active="true"] {
  color: var(--shell-accent);
  background: var(--shell-accent-muted);
}

.sb-shell .spatial-canvas__viewport {
  position: absolute;
  inset: 0;
  overflow: hidden;
  outline: none;
  background-color: var(
    --shell-spatial-canvas-background,
    light-dark(
      var(--shell-spatial-grid-background-light, var(--shell-canvas)),
      var(--shell-canvas)
    )
  );
  cursor: ${SPATIAL_CANVAS_CURSORS.select};
  touch-action: none;
  user-select: none;
}

.sb-shell .spatial-canvas__grid {
  position: absolute;
  inset: 0;
  color: light-dark(
    var(--shell-spatial-grid-dot-light, var(--shell-text-subtle)),
    var(--shell-spatial-grid-dot-dark, var(--shell-text-subtle))
  );
  background-image: radial-gradient(
    circle,
    currentColor calc(var(--shell-spatial-grid-radius) - var(--shell-spatial-grid-edge)),
    transparent calc(var(--shell-spatial-grid-radius) + var(--shell-spatial-grid-edge))
  );
  background-position:
    calc(-1 * var(--shell-icon-stroke))
    calc(-1 * var(--shell-icon-stroke));
  background-size: var(--shell-space-4) var(--shell-space-4);
  pointer-events: none;
}

.sb-shell .spatial-canvas__viewport:focus-visible {
  box-shadow: inset 0 0 0 var(--shell-focus-ring-width) var(--shell-focus, var(--shell-accent));
}

.sb-shell .spatial-canvas__viewport[data-tool="hand"] {
  cursor: ${SPATIAL_CANVAS_CURSORS.pan};
}

.sb-shell .spatial-canvas__viewport[data-tool="hand"]:active {
  cursor: ${SPATIAL_CANVAS_CURSORS.panning};
}

.sb-shell .spatial-canvas__viewport[data-tool="select"]:active {
  cursor: ${SPATIAL_CANVAS_CURSORS.crosshair};
}

.sb-shell .spatial-canvas__viewport:not([data-tool="select"]):not([data-tool="hand"]):not([data-tool="comment"]) {
  cursor: ${SPATIAL_CANVAS_CURSORS.crosshair};
}

.sb-shell .spatial-canvas input,
.sb-shell .spatial-canvas textarea,
.sb-shell .spatial-canvas [contenteditable="true"] {
  cursor: ${SPATIAL_CANVAS_CURSORS.text};
}

.sb-shell .spatial-canvas__viewport[data-tool="comment"] {
  cursor: none;
}

.sb-shell .spatial-canvas__scene {
  position: absolute;
  top: 0;
  left: 0;
  width: 1px;
  height: 1px;
  transform-origin: 0 0;
  will-change: transform;
}

.sb-shell .spatial-canvas__node {
  position: absolute;
  top: 0;
  left: 0;
  box-sizing: border-box;
  margin: 0;
  transform-origin: 0 0;
  will-change: transform;
}

.sb-shell .spatial-canvas__node[data-selected="true"] {
  outline: var(--shell-icon-stroke) solid var(--shell-focus, var(--shell-accent));
  outline-offset: var(--shell-focus-ring-offset);
}

.sb-shell .spatial-canvas__project {
  display: grid;
  grid-template-columns: var(--shell-control-sm) minmax(0, 1fr);
  align-content: center;
  padding: var(--shell-space-2);
  gap: 0 var(--shell-space-2);
  color: var(--shell-text);
  background: var(--shell-raised);
  border: 0;
  border-radius: var(--shell-radius-large);
  box-shadow: none;
  font-size: var(--shell-text-sm);
  line-height: var(--shell-leading-base);
  text-align: left;
  cursor: default;
}

.sb-shell .spatial-canvas__project:hover:not(:disabled) {
  border-color: var(--shell-border-hover, var(--shell-accent));
  background: var(--shell-hover);
}

.sb-shell .spatial-canvas__project:disabled {
  opacity: var(--shell-disabled-opacity, 0.5);
  cursor: ${SPATIAL_CANVAS_CURSORS.unavailable};
}

.sb-shell .spatial-canvas__project > .spatial-canvas__project-icon {
  display: grid;
  grid-column: 1;
  align-self: center;
  width: var(--shell-control-sm);
  height: var(--shell-control-sm);
  place-items: center;
  color: var(--shell-accent);
  background: transparent;
  border-radius: 0;
}

.sb-shell .spatial-canvas__project-copy {
  display: grid;
  grid-column: 2;
  min-width: 0;
  align-content: center;
}

.sb-shell .spatial-canvas__project-title,
.sb-shell .spatial-canvas__project-path,
.sb-shell .spatial-canvas__project-meta {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-shell .spatial-canvas__project-copy > * {
  grid-column: 1;
}

.sb-shell .spatial-canvas__project-title {
  color: var(--shell-text);
  font-size: var(--shell-text-sm);
  font-weight: var(--shell-weight-md);
}

.sb-shell .spatial-canvas__project-path,
.sb-shell .spatial-canvas__project-meta {
  color: var(--shell-text-muted);
  font-size: var(--shell-text-xs);
}

.sb-shell .spatial-canvas__item {
  padding: var(--shell-space-2);
  color: var(--shell-text);
  background: var(--shell-raised);
  border: 0;
  border-radius: var(--shell-radius-large);
  box-shadow: none;
  font-size: var(--shell-text-sm);
  line-height: var(--shell-leading-base);
  text-align: left;
  cursor: default;
}

.sb-shell .spatial-canvas__item-label {
  font-weight: var(--shell-weight-md);
}

.sb-shell .spatial-canvas__item[data-kind="sticky"] {
  background: var(--shell-active);
}

.sb-shell .spatial-canvas__item[data-kind="shape"] {
  display: grid;
  place-items: center;
  background: var(--shell-accent-muted, var(--shell-active));
  border-radius: var(--shell-radius);
}

.sb-shell .spatial-canvas__item[data-kind="section"] {
  z-index: -1;
  background: var(--shell-accent-muted);
  border: var(--shell-icon-stroke) solid var(--shell-border);
  border-radius: var(--shell-radius-large);
  box-shadow: none;
}

.sb-shell .spatial-canvas__connection-handles {
  position: absolute;
  inset: 0;
  opacity: 0;
  pointer-events: none;
}

.sb-shell .spatial-canvas__node[data-connecting="true"]:hover .spatial-canvas__connection-handles,
.sb-shell .spatial-canvas__node[data-connecting="true"]:focus-visible .spatial-canvas__connection-handles,
.sb-shell .spatial-canvas__node[data-connecting="true"][data-selected="true"] .spatial-canvas__connection-handles {
  opacity: 1;
}

.sb-shell .spatial-canvas__connection-handles > span {
  position: absolute;
  width: var(--shell-space-2);
  height: var(--shell-space-2);
  background: var(--shell-accent);
  border: var(--shell-icon-stroke) solid var(--shell-canvas);
  border-radius: var(--shell-radius-pill);
}

.sb-shell .spatial-canvas__connection-handles > [data-edge="top"] {
  top: calc(-1 * var(--shell-space-1));
  right: 0;
  left: 0;
  margin-inline: auto;
}

.sb-shell .spatial-canvas__connection-handles > [data-edge="right"] {
  top: 0;
  right: calc(-1 * var(--shell-space-1));
  bottom: 0;
  margin-block: auto;
}

.sb-shell .spatial-canvas__connection-handles > [data-edge="bottom"] {
  right: 0;
  bottom: calc(-1 * var(--shell-space-1));
  left: 0;
  margin-inline: auto;
}

.sb-shell .spatial-canvas__connection-handles > [data-edge="left"] {
  top: 0;
  bottom: 0;
  left: calc(-1 * var(--shell-space-1));
  margin-block: auto;
}

.sb-shell .spatial-canvas__connectors {
  position: absolute;
  z-index: -2;
  top: 0;
  left: 0;
  overflow: visible;
  pointer-events: none;
}

.sb-shell .spatial-canvas__connectors line {
  stroke: var(--shell-text-muted);
  stroke-width: var(--shell-icon-stroke);
  stroke-linecap: round;
  vector-effect: non-scaling-stroke;
}

.sb-shell .spatial-canvas__connectors circle {
  fill: var(--shell-text-muted);
  stroke: var(--shell-canvas);
  stroke-width: var(--shell-icon-stroke);
  vector-effect: non-scaling-stroke;
}

.sb-shell .spatial-canvas__marquee {
  position: absolute;
  top: 0;
  left: 0;
  background: var(--shell-accent-muted);
  border: var(--shell-icon-stroke) solid var(--shell-accent);
  pointer-events: none;
}

.sb-shell .spatial-canvas__comment-pin,
.sb-shell .spatial-canvas__comment-cursor,
.sb-shell .spatial-canvas__comment-anchor {
  position: absolute;
  top: 0;
  left: 0;
  display: grid;
  box-sizing: border-box;
  width: var(--shell-control-md);
  height: var(--shell-control-md);
  padding: var(--shell-space-1);
  place-items: center;
  border-radius: var(--shell-radius-pill) var(--shell-radius-pill) var(--shell-radius-pill) 0;
  box-shadow: var(--shell-elevation, none);
  font-size: var(--shell-text-xs);
  font-weight: var(--shell-weight-md);
  line-height: var(--shell-leading-base);
  translate: 0 -100%;
}

.sb-shell .spatial-canvas__comment-pin {
  color: var(--shell-text);
  background: var(--shell-raised);
  border: var(--shell-icon-stroke) solid var(--shell-border);
  cursor: ${SPATIAL_CANVAS_CURSORS.action};
}

.sb-shell .spatial-canvas__comment-cursor,
.sb-shell .spatial-canvas__comment-anchor {
  z-index: 12;
  pointer-events: none;
}

.sb-shell .spatial-canvas__comment-cursor {
  background: var(--shell-raised);
  border: var(--shell-icon-stroke) solid currentColor;
}

.sb-shell .spatial-canvas__comment-anchor {
  background: currentColor;
  border: var(--shell-icon-stroke) solid currentColor;
}

.sb-shell .spatial-canvas__comment-pin-avatar {
  display: grid;
  width: 100%;
  height: 100%;
  place-items: center;
  color: var(--shell-accent-contrast, var(--shell-text));
  background: var(--shell-accent);
  border-radius: var(--shell-radius-pill);
}

.sb-shell .spatial-canvas__comment-pin[data-selected="true"] {
  outline: var(--shell-focus-ring-width) solid var(--shell-focus, var(--shell-accent));
  outline-offset: var(--shell-focus-ring-offset);
}

.sb-shell .spatial-canvas__cursor {
  position: absolute;
  top: 0;
  left: 0;
  color: currentColor;
  pointer-events: none;
}

.sb-shell .spatial-canvas__cursor-glyph {
  position: absolute;
  top: 0;
  left: 0;
  display: grid;
  width: var(--shell-control-sm);
  height: var(--shell-control-sm);
  place-items: center;
  color: inherit;
}

.sb-shell .spatial-canvas__cursor-glyph > svg {
  width: var(--shell-space-4);
  height: var(--shell-space-4);
  stroke-width: var(--shell-icon-stroke);
}

.sb-shell .spatial-canvas__cursor-unavailable {
  position: relative;
  display: block;
  width: var(--shell-space-4);
  height: var(--shell-space-4);
}

.sb-shell .spatial-canvas__cursor-unavailable > svg {
  position: absolute;
  stroke-width: var(--shell-icon-stroke);
}

.sb-shell .spatial-canvas__cursor-unavailable-badge {
  right: calc(var(--shell-space-1) * -1);
  bottom: calc(var(--shell-space-1) * -1);
  width: calc(var(--shell-space-3) + 1px);
  height: calc(var(--shell-space-3) + 1px);
}

.sb-shell .spatial-canvas__cursor-label {
  position: absolute;
  top: var(--shell-space-3);
  left: var(--shell-space-4);
  display: flex;
  min-height: var(--shell-control-sm);
  align-items: center;
  padding-inline: var(--shell-space-2);
  color: inherit;
  background: currentColor;
  border-radius: var(--shell-radius-pill);
  box-shadow: var(--shell-elevation, none);
  font-size: var(--shell-text-sm);
  font-weight: var(--shell-weight-md);
  line-height: var(--shell-leading-base);
  white-space: nowrap;
}

.sb-shell .spatial-canvas__cursor-label > span {
  color: var(--shell-accent-contrast, var(--shell-text));
}

.sb-shell .spatial-canvas__viewport[data-tool="hand"] .spatial-canvas__project,
.sb-shell .spatial-canvas__viewport[data-tool="hand"] .spatial-canvas__item {
  cursor: grab;
}

.sb-shell .spatial-canvas__viewport[data-tool="hand"]:active .spatial-canvas__project,
.sb-shell .spatial-canvas__viewport[data-tool="hand"]:active .spatial-canvas__item {
  cursor: grabbing;
}

.sb-shell .spatial-canvas__floating-panel {
  position: absolute;
  z-index: 8;
  top: calc(var(--shell-control-md) + var(--shell-space-5));
  left: var(--shell-space-2);
  display: grid;
  width: calc(var(--shell-row-height) * 5 + var(--shell-space-3));
  max-height: calc(100% - var(--shell-row-height) * 3);
  padding: 0;
  overflow: auto;
  gap: var(--shell-space-1);
  background: transparent;
  border: 0;
  border-radius: var(--shell-radius);
  box-shadow: none;
  font-size: var(--shell-text-sm);
}

.sb-shell .spatial-canvas__floating-panel > span {
  color: var(--shell-text-muted);
}

.sb-shell .spatial-canvas__zoom {
  position: absolute;
  z-index: 9;
  right: var(--shell-space-2);
  bottom: var(--shell-space-2);
}

.sb-shell .spatial-canvas__side-panel {
  position: absolute;
  z-index: 12;
  top: calc(var(--shell-control-md) + var(--shell-space-5));
  right: var(--shell-space-2);
  bottom: calc(var(--shell-control-md) + var(--shell-space-5));
  display: grid;
  grid-template-rows: auto 1fr auto;
  width: min(20rem, calc(100% - 1.5rem));
  overflow: hidden;
  background: var(--shell-raised);
  border: 0;
  border-radius: var(--shell-radius-large);
  box-shadow: var(--shell-elevation, none);
  font-size: var(--shell-text-sm);
  line-height: var(--shell-leading-base);
}

.sb-shell .spatial-canvas__side-panel[data-edge="true"] {
  top: var(--shell-space-2);
  right: var(--shell-space-2);
  bottom: var(--shell-space-2);
  width: calc(var(--shell-row-height) * 8 + var(--shell-space-2));
  border: var(--shell-icon-stroke) solid var(--shell-border);
  border-radius: var(--shell-radius-large);
  box-shadow: var(--shell-elevation, none);
}

.sb-shell .spatial-canvas__side-panel > header,
.sb-shell .spatial-canvas__side-panel > form {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--shell-space-2);
  gap: var(--shell-space-2);
  border-bottom: var(--shell-icon-stroke) solid var(--shell-border-strong, var(--shell-border));
}

.sb-shell .spatial-canvas__side-panel > header > strong,
.sb-shell .spatial-canvas__comment-card > header > strong {
  font-size: var(--shell-text-sm);
  font-weight: var(--shell-weight-lg);
  line-height: var(--shell-leading-base);
}

.sb-shell .spatial-canvas__side-panel > form {
  border-top: var(--shell-icon-stroke) solid var(--shell-border-strong, var(--shell-border));
  border-bottom: 0;
}

.sb-shell .spatial-canvas__side-panel > form .input {
  flex: 1;
}

.sb-shell .spatial-canvas__side-panel-body {
  overflow: auto;
}

.sb-shell .spatial-canvas__side-panel-body article {
  padding: var(--shell-space-3);
  border-bottom: var(--shell-icon-stroke) solid var(--shell-border-strong, var(--shell-border));
}

.sb-shell .spatial-canvas__side-panel-body article[data-resolved="true"] {
  background: var(--shell-hover);
}

.sb-shell .spatial-canvas__side-panel-body p {
  margin: var(--shell-space-1) 0;
}

.sb-shell .spatial-canvas__panel-header {
  display: flex;
  flex: 1;
  align-items: center;
  gap: var(--shell-space-1);
}

.sb-shell .spatial-canvas__panel-header .input {
  min-width: 0;
  font-size: var(--shell-text-sm);
  line-height: var(--shell-leading-base);
}

.sb-shell .spatial-canvas__search-results {
  display: grid;
  padding: var(--shell-space-1);
  gap: var(--shell-space-1);
}

.sb-shell .spatial-canvas__search-result {
  display: grid;
  grid-template-columns: var(--shell-control-sm) minmax(0, 1fr);
  align-items: center;
  width: 100%;
  min-height: var(--shell-row-height);
  padding: var(--shell-space-2);
  gap: var(--shell-space-2);
  color: var(--shell-text);
  background: transparent;
  border: 0;
  border-radius: var(--shell-radius);
  font: inherit;
  text-align: left;
  cursor: ${SPATIAL_CANVAS_CURSORS.action};
}

.sb-shell .spatial-canvas__search-result:hover:not(:disabled),
.sb-shell .spatial-canvas__search-result:focus-visible {
  background: var(--shell-hover);
}

.sb-shell .spatial-canvas__search-result:disabled {
  opacity: var(--shell-disabled-opacity, 0.5);
  cursor: ${SPATIAL_CANVAS_CURSORS.unavailable};
}

.sb-shell .spatial-canvas__search-result > span {
  display: grid;
  min-width: 0;
}

.sb-shell .spatial-canvas__search-result strong,
.sb-shell .spatial-canvas__search-result small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-shell .spatial-canvas__search-result strong {
  font-size: var(--shell-text-sm);
  font-weight: var(--shell-weight-md);
  line-height: var(--shell-leading-base);
}

.sb-shell .spatial-canvas__search-result small,
.sb-shell .spatial-canvas__search-empty {
  color: var(--shell-text-muted);
  font-size: var(--shell-text-xs);
  line-height: var(--shell-leading-base);
}

.sb-shell .spatial-canvas__search-empty {
  padding: var(--shell-space-3);
}

.sb-shell .spatial-canvas__comment-thread {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: start;
  gap: var(--shell-space-1);
  padding: var(--shell-space-2);
  border-bottom: var(--shell-icon-stroke) solid var(--shell-border);
}

.sb-shell .spatial-canvas__comment-thread[data-selected="true"] {
  background: var(--shell-accent-muted);
}

.sb-shell .spatial-canvas__comment-thread[data-resolved="true"] {
  background: var(--shell-hover);
}

.sb-shell .spatial-canvas__comment-thread > button:first-child {
  display: grid;
  grid-template-columns: var(--shell-control-sm) minmax(0, 1fr);
  width: 100%;
  padding: 0;
  gap: var(--shell-space-2);
  color: var(--shell-text);
  background: transparent;
  border: 0;
  font: inherit;
  text-align: left;
  cursor: ${SPATIAL_CANVAS_CURSORS.action};
}

.sb-shell .spatial-canvas__comment-thread > button:first-child > span:last-child {
  display: grid;
  min-width: 0;
}

.sb-shell .spatial-canvas__comment-thread-meta {
  display: flex;
  align-items: baseline;
  gap: var(--shell-space-1);
}

.sb-shell .spatial-canvas__comment-thread-meta strong {
  font-size: var(--shell-text-sm);
  font-weight: var(--shell-weight-md);
  line-height: var(--shell-leading-base);
}

.sb-shell .spatial-canvas__comment-thread strong,
.sb-shell .spatial-canvas__comment-thread small,
.sb-shell .spatial-canvas__comment-thread span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-shell .spatial-canvas__comment-thread small {
  color: var(--shell-text-muted);
  font-size: var(--shell-text-xs);
  line-height: var(--shell-leading-base);
}

.sb-shell .spatial-canvas__comment-thread-actions {
  display: flex;
  align-items: center;
  gap: var(--shell-space-1);
}

.sb-shell .spatial-canvas__comment-author {
  display: grid;
  width: var(--shell-control-sm);
  height: var(--shell-control-sm);
  place-items: center;
  color: var(--shell-text);
  background: var(--shell-raised);
  border: var(--shell-icon-stroke) solid var(--shell-accent);
  border-radius: var(--shell-radius-pill);
  font-size: var(--shell-text-xs);
}

.sb-shell .spatial-canvas__comment-composer {
  position: absolute;
  z-index: 13;
  top: 0;
  left: 0;
  display: grid;
  width: calc(var(--shell-row-height) * 7);
  overflow: hidden;
  background: var(--shell-raised);
  border: var(--shell-icon-stroke) solid var(--shell-accent);
  border-radius: var(--shell-radius-large);
  box-shadow: var(--shell-elevation, none);
  translate:
    calc(var(--shell-control-md) + var(--shell-space-3))
    calc(-1 * (var(--shell-control-md) + var(--shell-space-2)));
}

.sb-shell .spatial-canvas__comment-composer[data-state="empty"] {
  grid-template-columns: minmax(0, 1fr) var(--shell-control-sm);
  align-items: center;
  padding: var(--shell-space-1);
  gap: var(--shell-space-1);
  border-radius: var(--shell-radius-pill);
  margin-top:
    calc(
      -1 * (
        var(--shell-space-3) +
        var(--shell-icon-stroke) +
        var(--shell-icon-stroke)
      )
    );
  translate:
    calc(var(--shell-control-md) + var(--shell-space-3))
    -50%;
}

.sb-shell .spatial-canvas__comment-composer[data-state="empty"]:focus-within {
  border-color: var(--shell-accent);
}

.sb-shell .spatial-canvas__comment-composer .input {
  min-height: calc(var(--shell-row-height) * 2);
  padding: var(--shell-space-3);
  resize: none;
  background: transparent;
  border: 0;
  border-radius: 0;
}

.sb-shell .spatial-canvas__comment-composer .input:focus-visible {
  box-shadow: none;
  outline: 0;
}

.sb-shell .spatial-canvas__comment-composer[data-state="empty"] .input {
  min-height: var(--shell-control-md);
  padding: 0 var(--shell-space-2);
  background: transparent;
  border: 0;
  border-radius: var(--shell-radius-pill);
  line-height: var(--shell-control-md);
}

.sb-shell .spatial-canvas__comment-composer > footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--shell-space-1) var(--shell-space-2);
  border-top: var(--shell-icon-stroke) solid var(--shell-border);
}

.sb-shell .spatial-canvas__comment-composer[data-state="empty"] > footer {
  padding: 0;
  border: 0;
}

.sb-shell .spatial-canvas__comment-submit {
  border-radius: var(--shell-radius-pill);
}

.sb-shell .spatial-canvas__comment-composer[data-state="typing"] .spatial-canvas__comment-submit:not(:disabled) {
  color: var(--shell-accent-contrast, var(--shell-text));
}

.sb-shell .spatial-canvas__comment-composer > footer > [role="group"] {
  display: flex;
  gap: var(--shell-space-1);
}

.sb-shell .spatial-canvas__comment-card {
  position: absolute;
  z-index: 13;
  top: 0;
  left: 0;
  display: grid;
  width: calc(var(--shell-row-height) * 8 + var(--shell-space-2));
  max-height: calc(var(--shell-row-height) * 12);
  overflow: hidden;
  background: var(--shell-raised);
  border: var(--shell-icon-stroke) solid var(--shell-border);
  border-radius: var(--shell-radius-large);
  box-shadow: var(--shell-elevation, none);
}

.sb-shell .spatial-canvas__comment-card[data-resolved="true"] {
  border-style: dashed;
  box-shadow: none;
}

.sb-shell .spatial-canvas__comment-card[data-side="left"] {
  margin-left: calc(-1 * (var(--shell-row-height) * 8 + var(--shell-space-5)));
}

.sb-shell .spatial-canvas__comment-card[data-side="right"] {
  margin-left: calc(var(--shell-control-sm) + var(--shell-space-2));
}

.sb-shell .spatial-canvas__comment-card[data-vertical="above"] {
  translate: 0 calc(-100% - var(--shell-space-2));
}

.sb-shell .spatial-canvas__comment-card > header,
.sb-shell .spatial-canvas__comment-card > header > [role="group"],
.sb-shell .spatial-canvas__comment-card > form {
  display: flex;
  align-items: center;
}

.sb-shell .spatial-canvas__comment-card > header {
  justify-content: space-between;
  min-height: var(--shell-row-height);
  padding: var(--shell-space-1) var(--shell-space-2);
  border-bottom: var(--shell-icon-stroke) solid var(--shell-border);
}

.sb-shell .spatial-canvas__comment-card > header > [role="group"] {
  gap: var(--shell-space-1);
}

.sb-shell .spatial-canvas__comment-card-thread {
  overflow: auto;
}

.sb-shell .spatial-canvas__comment-card-thread > article {
  display: grid;
  grid-template-columns: var(--shell-control-sm) minmax(0, 1fr);
  padding: var(--shell-space-3);
  gap: var(--shell-space-2);
}

.sb-shell .spatial-canvas__comment-card-thread > article + article {
  padding-top: 0;
}

.sb-shell .spatial-canvas__comment-card-thread > article > div {
  display: grid;
  min-width: 0;
  gap: var(--shell-space-1);
}

.sb-shell .spatial-canvas__comment-card-thread > article > .spatial-canvas__comment-author {
  translate: 0 calc(var(--shell-icon-stroke) * -2);
}

.sb-shell .spatial-canvas__comment-body {
  overflow-wrap: anywhere;
  font-size: var(--shell-text-sm);
  line-height: var(--shell-leading-base);
  white-space: pre-wrap;
}

.sb-shell .spatial-canvas__comment-body mark {
  color: var(--shell-accent);
  background: transparent;
}

.sb-shell .spatial-canvas__comment-card > form {
  display: grid;
  grid-template-columns: var(--shell-control-sm) minmax(0, 1fr) var(--shell-control-sm);
  padding: var(--shell-space-2) var(--shell-space-3);
  gap: var(--shell-space-2);
  border-top: var(--shell-icon-stroke) solid var(--shell-border);
}

.sb-shell .spatial-canvas__comment-card > form .input {
  min-height: var(--shell-control-sm);
  padding: var(--shell-space-1) var(--shell-space-2);
  resize: none;
  font-size: var(--shell-text-sm);
  line-height: var(--shell-leading-base);
}

@media (prefers-reduced-motion: reduce) {
  .sb-shell .spatial-canvas__scene,
  .sb-shell .spatial-canvas__node {
    will-change: auto;
  }
}
`;
