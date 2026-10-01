export const SPATIAL_CANVAS_STYLES = `
.sb-shell .spatial-canvas-surface__overlay {
  position: fixed;
  inset: 0;
  background: var(--shell-canvas);
}

.sb-shell .spatial-canvas-surface {
  position: fixed;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  padding: 0;
  overflow: hidden;
  background: var(--shell-canvas);
  border: 0;
  border-radius: 0;
  box-shadow: none;
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
  background: var(--shell-canvas);
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
  overflow: visible;
  background: transparent;
}

.sb-shell .spatial-canvas__page-title {
  max-width: calc(var(--shell-row-height) * 4);
  padding-inline: var(--shell-space-2);
  overflow: hidden;
  font-size: var(--shell-text-sm);
  font-weight: var(--shell-weight-md);
  text-overflow: ellipsis;
  white-space: nowrap;
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
.sb-shell .spatial-canvas__pages-popover > [role="tablist"] {
  display: flex;
  align-items: center;
  gap: var(--shell-space-1);
}

.sb-shell .spatial-canvas__pages-popover > header {
  justify-content: space-between;
}

.sb-shell .spatial-canvas__pages-popover > [role="tablist"] {
  display: grid;
}

.sb-shell .spatial-canvas__topbar .icon-button,
.sb-shell .spatial-canvas__controls .icon-button,
.sb-shell .spatial-canvas__zoom .icon-button {
  width: var(--shell-control-sm);
  height: var(--shell-control-sm);
}

.sb-shell .spatial-canvas__pages-popover .btn {
  justify-content: flex-start;
  width: 100%;
  border-color: transparent;
  background: transparent;
}

.sb-shell .spatial-canvas__pages-popover .btn[aria-selected="true"] {
  background: var(--shell-active);
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
  background-color: var(--shell-canvas);
  cursor: default;
  touch-action: none;
  user-select: none;
}

.sb-shell .spatial-canvas__viewport::before {
  position: absolute;
  inset: 0;
  background-image: radial-gradient(
    circle,
    var(--shell-border) var(--shell-icon-stroke),
    transparent var(--shell-icon-stroke)
  );
  background-position:
    calc(-1 * var(--shell-icon-stroke))
    calc(-1 * var(--shell-icon-stroke));
  background-size: var(--shell-space-4) var(--shell-space-4);
  content: "";
  opacity: var(--shell-disabled-opacity, 0.5);
  pointer-events: none;
}

.sb-shell .spatial-canvas__viewport:focus-visible {
  box-shadow: inset 0 0 0 var(--shell-focus-ring-width) var(--shell-focus, var(--shell-accent));
}

.sb-shell .spatial-canvas__viewport[data-tool="hand"] {
  cursor: grab;
}

.sb-shell .spatial-canvas__viewport:not([data-tool="select"]):not([data-tool="hand"]) {
  cursor: crosshair;
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
  cursor: move;
}

.sb-shell .spatial-canvas__project:hover:not(:disabled) {
  border-color: var(--shell-border-hover, var(--shell-accent));
  background: var(--shell-hover);
}

.sb-shell .spatial-canvas__project:disabled {
  opacity: var(--shell-disabled-opacity, 0.5);
  cursor: not-allowed;
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
  cursor: move;
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

.sb-shell .spatial-canvas__comment-pin {
  position: absolute;
  top: 0;
  left: 0;
  display: grid;
  width: var(--shell-control-md);
  height: var(--shell-control-md);
  place-items: center;
  color: var(--shell-text);
  background: var(--shell-raised);
  border: var(--shell-icon-stroke) solid var(--shell-border);
  border-radius: var(--shell-radius-pill) var(--shell-radius-pill) var(--shell-radius-pill) 0;
  box-shadow: var(--shell-elevation, none);
  font-size: var(--shell-text-xs);
  font-weight: var(--shell-weight-md);
  cursor: pointer;
}

.sb-shell .spatial-canvas__comment-pin[data-selected="true"] {
  border-color: var(--shell-accent);
  outline: var(--shell-icon-stroke) solid var(--shell-accent);
  outline-offset: var(--shell-focus-ring-offset);
}

.sb-shell .spatial-canvas__cursor {
  position: absolute;
  top: 0;
  left: 0;
  padding: var(--shell-space-1) var(--shell-space-2);
  color: currentColor;
  background: currentColor;
  border-radius: 0 var(--shell-radius) var(--shell-radius);
  font-size: var(--shell-text-xs);
  pointer-events: none;
}

.sb-shell .spatial-canvas__cursor::before {
  position: absolute;
  top: calc(-1 * var(--shell-space-2));
  left: calc(-1 * var(--shell-focus-ring-width));
  width: 0;
  height: 0;
  border-right: var(--shell-space-2) solid transparent;
  border-bottom: var(--shell-space-3) solid currentColor;
  content: "";
}

.sb-shell .spatial-canvas__cursor > span {
  color: var(--shell-accent-contrast, var(--shell-text));
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
  opacity: var(--shell-disabled-opacity, 0.5);
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
}

.sb-shell .spatial-canvas__comment-thread {
  display: grid;
  grid-template-columns: minmax(0, 1fr) var(--shell-control-sm);
  align-items: start;
  gap: var(--shell-space-1);
  padding: var(--shell-space-2);
  border-bottom: var(--shell-icon-stroke) solid var(--shell-border);
}

.sb-shell .spatial-canvas__comment-thread[data-selected="true"] {
  background: var(--shell-accent-muted);
}

.sb-shell .spatial-canvas__comment-thread[data-resolved="true"] {
  opacity: var(--shell-disabled-opacity, 0.5);
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
  cursor: pointer;
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

.sb-shell .spatial-canvas__comment-thread strong,
.sb-shell .spatial-canvas__comment-thread small,
.sb-shell .spatial-canvas__comment-thread span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-shell .spatial-canvas__comment-thread small {
  color: var(--shell-text-muted);
}

.sb-shell .spatial-canvas__comment-author {
  display: grid;
  width: var(--shell-control-sm);
  height: var(--shell-control-sm);
  place-items: center;
  color: var(--shell-accent-contrast, var(--shell-text));
  background: var(--shell-accent);
  border-radius: var(--shell-radius-pill);
  font-size: var(--shell-text-xs);
}

.sb-shell .spatial-canvas__comment-composer {
  position: absolute;
  z-index: 13;
  top: 0;
  left: 0;
  display: grid;
  width: calc(var(--shell-row-height) * 10);
  overflow: hidden;
  background: var(--shell-raised);
  border: var(--shell-icon-stroke) solid var(--shell-accent);
  border-radius: var(--shell-radius-large);
  box-shadow: var(--shell-elevation, none);
  margin: var(--shell-space-3);
}

.sb-shell .spatial-canvas__comment-composer .input {
  min-height: calc(var(--shell-row-height) * 2);
  padding: var(--shell-space-3);
  resize: none;
  background: transparent;
  border: 0;
  border-radius: 0;
}

.sb-shell .spatial-canvas__comment-composer > footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--shell-space-1) var(--shell-space-2);
  border-top: var(--shell-icon-stroke) solid var(--shell-border);
}

.sb-shell .spatial-canvas__comment-composer > footer > [role="group"] {
  display: flex;
  gap: var(--shell-space-1);
}

@media (prefers-reduced-motion: reduce) {
  .sb-shell .spatial-canvas__scene,
  .sb-shell .spatial-canvas__node {
    will-change: auto;
  }
}
`;
