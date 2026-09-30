export const SPATIAL_CANVAS_STYLES = `
.sb-shell .spatial-canvas {
  position: relative;
  min-height: var(--shell-spatial-min-height);
  height: var(--shell-spatial-height);
  overflow: hidden;
  color: var(--shell-text);
  background: var(--shell-canvas);
  border: 0;
  border-radius: var(--shell-radius);
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
.sb-shell .spatial-canvas__pages > [role="tablist"],
.sb-shell .spatial-canvas__controls,
.sb-shell .spatial-canvas__zoom {
  display: flex;
  align-items: center;
  gap: var(--shell-space-1);
  padding: var(--shell-space-1);
  background: var(--shell-raised);
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius);
  box-shadow: var(--shell-elevation, none);
}

.sb-shell .spatial-canvas__corner {
  padding: 0;
  background: transparent;
  border: 0;
  box-shadow: none;
  backdrop-filter: none;
}

.sb-shell .spatial-canvas__pages {
  min-width: 0;
  overflow: auto;
}

.sb-shell .spatial-canvas__pages .btn {
  border-color: transparent;
  background: transparent;
}

.sb-shell .spatial-canvas__pages .btn[aria-selected="true"] {
  background: var(--shell-active);
}

.sb-shell .spatial-canvas__avatar {
  display: grid;
  width: var(--shell-control-sm);
  height: var(--shell-control-sm);
  margin-right: calc(-1 * var(--shell-space-2));
  place-items: center;
  color: var(--shell-accent-contrast, var(--shell-text));
  border: var(--shell-focus-ring-width) solid var(--shell-raised);
  border-radius: var(--shell-radius-pill);
  font-size: var(--shell-text-xs);
  font-weight: var(--shell-weight-lg);
}

.sb-shell .spatial-canvas__avatar:last-of-type {
  margin-right: var(--shell-space-1);
}

.sb-shell .spatial-canvas__controls {
  position: absolute;
  z-index: 9;
  bottom: var(--shell-space-3);
  left: var(--shell-spatial-center);
  transform: translateX(-50%);
}

.sb-shell .spatial-canvas__controls .icon-button[data-active="true"],
.sb-shell .spatial-canvas__presence .icon-button[data-active="true"] {
  color: var(--shell-accent-contrast, var(--shell-text));
  background: var(--shell-accent);
}

.sb-shell .spatial-canvas__viewport {
  position: absolute;
  inset: 0;
  overflow: hidden;
  outline: none;
  background-color: var(--shell-canvas);
  background-image: radial-gradient(
    circle,
    var(--shell-border) var(--shell-spatial-dot-size),
    transparent var(--shell-spatial-dot-cutoff)
  );
  background-position: -1px -1px;
  background-size: var(--shell-space-5) var(--shell-space-5);
  cursor: default;
  touch-action: none;
  user-select: none;
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
  outline: var(--shell-focus-ring-width) solid var(--shell-focus, var(--shell-accent));
  outline-offset: var(--shell-focus-ring-offset);
}

.sb-shell .spatial-canvas__project {
  display: grid;
  grid-template-columns: var(--shell-control-md) minmax(0, 1fr);
  grid-template-rows: repeat(3, min-content);
  align-content: center;
  padding: var(--shell-space-3);
  gap: 0 var(--shell-space-2);
  color: var(--shell-text);
  background: var(--shell-raised);
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius);
  box-shadow: var(--shell-elevation, none);
  font-size: var(--shell-text-sm);
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
  grid-row: 1 / 4;
  align-self: center;
  width: var(--shell-control-md);
  height: var(--shell-control-md);
  place-items: center;
  color: var(--shell-accent-contrast, var(--shell-text));
  background: var(--shell-accent);
  border-radius: var(--shell-radius);
}

.sb-shell .spatial-canvas__project strong,
.sb-shell .spatial-canvas__project span,
.sb-shell .spatial-canvas__project small {
  grid-column: 2;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sb-shell .spatial-canvas__project strong {
  grid-row: 1;
  font-weight: var(--shell-weight-lg);
}

.sb-shell .spatial-canvas__project > span:not(.spatial-canvas__project-icon) {
  grid-row: 2;
}

.sb-shell .spatial-canvas__project > small {
  grid-row: 3;
}

.sb-shell .spatial-canvas__project span,
.sb-shell .spatial-canvas__project small {
  color: var(--shell-text-muted);
  font-size: var(--shell-text-xs);
}

.sb-shell .spatial-canvas__project-meta {
  min-width: 0;
}

.sb-shell .spatial-canvas__item {
  padding: var(--shell-space-3);
  color: var(--shell-text);
  background: var(--shell-raised);
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius);
  box-shadow: var(--shell-elevation, none);
  font-size: var(--shell-text-sm);
  cursor: move;
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
  border: var(--shell-focus-ring-width) solid var(--shell-accent);
  border-radius: var(--shell-radius);
  box-shadow: none;
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
  stroke-width: 2;
  vector-effect: non-scaling-stroke;
}

.sb-shell .spatial-canvas__marquee {
  position: absolute;
  top: 0;
  left: 0;
  background: var(--shell-accent-muted);
  border: 1px solid var(--shell-accent);
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
  color: var(--shell-accent-contrast, var(--shell-text));
  background: var(--shell-accent);
  border: var(--shell-focus-ring-width) solid var(--shell-raised);
  border-radius: var(--shell-radius-pill) var(--shell-radius-pill) var(--shell-radius-pill) 0;
  box-shadow: var(--shell-elevation, none);
  cursor: pointer;
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
  top: var(--shell-spatial-panel-top);
  left: var(--shell-space-2);
  display: grid;
  width: var(--shell-spatial-panel-width);
  max-height: calc(100% - var(--shell-spatial-panel-clearance));
  padding: var(--shell-space-2);
  overflow: auto;
  gap: var(--shell-space-1);
  background: var(--shell-raised);
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius);
  box-shadow: var(--shell-elevation, none);
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
  top: var(--shell-spatial-panel-top);
  right: var(--shell-space-2);
  bottom: var(--shell-spatial-side-bottom);
  display: grid;
  grid-template-rows: auto 1fr auto;
  width: min(20rem, calc(100% - 1.5rem));
  overflow: hidden;
  background: var(--shell-raised);
  border: 1px solid var(--shell-border);
  border-radius: var(--shell-radius);
  box-shadow: var(--shell-elevation, none);
}

.sb-shell .spatial-canvas__side-panel > header,
.sb-shell .spatial-canvas__side-panel > form {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: var(--shell-space-3);
  gap: var(--shell-space-2);
  border-bottom: 1px solid var(--shell-border-strong, var(--shell-border));
}

.sb-shell .spatial-canvas__side-panel > form {
  border-top: 1px solid var(--shell-border-strong, var(--shell-border));
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
  border-bottom: 1px solid var(--shell-border-strong, var(--shell-border));
}

.sb-shell .spatial-canvas__side-panel-body article[data-resolved="true"] {
  opacity: var(--shell-disabled-opacity, 0.5);
}

.sb-shell .spatial-canvas__side-panel-body p {
  margin: var(--shell-space-1) 0;
}

@media (prefers-reduced-motion: reduce) {
  .sb-shell .spatial-canvas__scene,
  .sb-shell .spatial-canvas__node {
    will-change: auto;
  }
}
`;
