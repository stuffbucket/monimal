// ---- Styles ----
//
// Injected once on import, guarded by element id so HMR reloads don't pile up
// duplicate <style> tags. What is left here is this surface's own layout — the
// rail, section rhythm, disclosure cards, device-code and accounts
// blocks. The controls inside them are the package's (`Note`, `Button`,
// `CopyButton`), and they ship their own rules, so `.settings-note` and
// `.settings-button` are gone rather than renamed. No component in this
// directory declares a classname of its own, so there is still one place to
// check for drift. Values read the `--shell-*` contract with fallbacks, so a
// host that defines no theme still renders something legible.
//
// SettingsPage owns the H1, divider, and scrolling surface. These rules only
// style Maximal-specific content inside that shared frame.
const SETTINGS_CSS = `
.sb-shell .settings__workbar-title {
  display: inline-flex;
  gap: var(--shell-space-2, 8px);
  align-items: center;
}

/* The rail. Its own rules rather than the shell's .nav class, which belongs to
   NavRail and carries a selection model this rail does not have. */
.settings-rail {
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: var(--shell-space-1, 4px);
  min-height: 0;
  font-size: var(--shell-text-base, 0.875rem);
  line-height: var(--shell-leading-base, 1.5);
}

.settings-rail__link {
  display: flex;
  align-items: center;
  gap: var(--shell-space-2, 8px);
  appearance: none;
  border: 0;
  border-radius: var(--shell-radius, 6px);
  min-height: 36px;
  padding: 0 var(--shell-space-2, 8px);
  color: var(--maximal-color-text-secondary, #a0a8b4);
  background: transparent;
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.settings-rail__link:hover {
  color: var(--maximal-color-text-default, #f5f5f5);
  background: var(--maximal-color-bg-hover, rgb(255 255 255 / 0.06));
}

/* Colour and weight together, so the current section is never marked by hue
   alone. */
.settings-rail__link[aria-current='page'] {
  color: var(--maximal-color-text-onselected);
  background: var(--maximal-color-bg-selected, rgb(81 152 166 / 0.12));
  font-weight: 500;
}

.settings-rail__link:focus-visible {
  outline: 2px solid var(--maximal-color-border-selected, var(--maximal-color-border-brand, #5198a6));
  outline-offset: 2px;
}

.settings-rail__link[aria-label] {
  width: 48px;
  min-height: 48px;
  justify-content: center;
  padding: 0;
}


.settings-section {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-3, 12px);
  min-width: 0;
}

.appearance-actions {
  display: flex;
  align-items: center;
  gap: var(--shell-space-2, 8px);
}

.theme-library-toolbar {
  display: flex;
  align-items: center;
  gap: var(--shell-space-3, 12px);
  flex-wrap: wrap;
}

.theme-library-toolbar > .input--select {
  flex: 0 1 14rem;
}

.theme-library-toolbar > .input:not(.input--select) {
  flex: 1 1 18rem;
  max-width: 32rem;
}

.theme-library-toolbar__actions {
  display: flex;
  align-items: center;
  gap: var(--shell-space-2, 8px);
  margin-inline-start: auto;
}

.theme-library-results {
  color: var(--maximal-color-text-tertiary, #8f97a2);
  font-size: var(--shell-text-sm, 0.8125rem);
}

.theme-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(13rem, 1fr));
  gap: var(--shell-space-3, 12px);
  padding: 2px;
}

.theme-board-scroll {
  overflow-x: auto;
  border: 1px solid var(--maximal-color-border-default);
  border-radius: calc(var(--shell-radius, 6px) + 2px);
  background: var(--maximal-color-bg-default);
}

.theme-board {
  display: grid;
  grid-template-columns: 5.5rem repeat(8, minmax(9.5rem, 1fr));
  grid-template-rows: 2rem repeat(8, minmax(10rem, auto));
  gap: 1px;
  min-width: 82rem;
  padding: 1px;
  background: var(--maximal-color-border-default);
}

.theme-board__corner,
.theme-board__hue,
.theme-board__cue {
  position: sticky;
  z-index: 2;
  display: grid;
  padding: var(--shell-space-1, 4px);
  color: var(--maximal-color-text-secondary);
  background: var(--maximal-color-bg-tertiary);
  font-size: var(--shell-text-xs, 0.75rem);
  font-weight: 600;
  place-items: center;
}

.theme-board__corner {
  z-index: 3;
  top: 0;
  left: 0;
  grid-column: 1;
  grid-row: 1;
}

.theme-board__hue {
  top: 0;
  grid-row: 1;
}

.theme-board__cue {
  left: 0;
  grid-column: 1;
}

.theme-board__cell {
  display: grid;
  align-content: start;
  gap: var(--shell-space-1, 4px);
  min-width: 0;
  padding: var(--shell-space-1, 4px);
  background: var(--maximal-color-bg-secondary);
}

.theme-board__nearby {
  color: var(--maximal-color-text-tertiary);
  font-size: var(--shell-text-xs, 0.75rem);
}

.theme-board__nearby summary {
  padding: var(--shell-space-1, 4px);
  cursor: pointer;
}

.theme-board__nearby > div {
  display: grid;
  gap: var(--shell-space-1, 4px);
  padding-top: var(--shell-space-1, 4px);
}

.theme-card {
  display: grid;
  grid-template-rows: 6.5rem auto auto;
  gap: var(--shell-space-2, 8px);
  min-width: 0;
  padding: var(--shell-space-2, 8px);
  color: var(--maximal-color-text-default, #e6e8eb);
  text-align: left;
  border: 1px solid var(--maximal-color-border-default, #343943);
  border-radius: calc(var(--shell-radius, 6px) + 2px);
  background: var(--maximal-color-bg-tertiary, #252830);
  cursor: pointer;
}

.theme-card--compact {
  grid-template-rows: 4rem auto;
  gap: var(--shell-space-1, 4px);
  padding: var(--shell-space-1, 4px);
}

.theme-card--compact .theme-card__copy > span,
.theme-card--compact .theme-card__meta {
  display: none;
}

.theme-card--compact.theme-card--show-meta .theme-card__meta {
  display: block;
}

.theme-card--compact .theme-card__copy strong {
  font-size: var(--shell-text-xs, 0.75rem);
}

.theme-card:hover {
  border-color: var(--maximal-color-border-strong, #515a69);
  transform: translateY(-1px);
}

.theme-card[aria-pressed='true'],
.theme-card[data-current='true'] {
  border-color: var(--maximal-color-border-brand, #5198a6);
  box-shadow: 0 0 0 2px var(--maximal-color-bg-selected, rgb(81 152 166 / 0.18));
}

.theme-card[aria-pressed='true'] .theme-card__copy strong::after,
.theme-card[data-current='true'] .theme-card__copy strong::after {
  content: ' · Selected';
  color: var(--maximal-color-text-brand, #5198a6);
  font-size: var(--shell-text-xs, 0.75rem);
}

.theme-card:focus-visible {
  outline: 2px solid var(--maximal-color-border-selected, var(--maximal-color-border-brand, #5198a6));
  outline-offset: 2px;
}

.theme-card:disabled {
  cursor: wait;
  opacity: var(--shell-disabled-opacity, 0.5);
}

.theme-card[data-current='true'] {
  cursor: default;
}

.theme-card__preview {
  --theme-card-background: rgb(17 19 23);
  --theme-card-surface: rgb(28 31 38);
  --theme-card-text: rgb(245 245 245);
  --theme-card-accent: rgb(81 152 166);

  display: flex;
  align-items: end;
  gap: var(--shell-space-2, 8px);
  padding: var(--shell-space-3, 12px);
  overflow: hidden;
  border-radius: var(--shell-radius, 6px);
  color: var(--theme-card-text);
  background-color: var(--theme-card-background);
  background-image:
    linear-gradient(
      145deg,
      var(--theme-card-background),
      var(--theme-card-surface)
    );
}

.theme-card__preview span {
  display: block;
  height: 0.65rem;
  border-radius: var(--shell-radius-pill, 9999px);
  background: currentColor;
}

.theme-card__preview span:first-child {
  width: 42%;
}

.theme-card__preview span:nth-child(2) {
  width: 24%;
  background: var(--theme-card-accent);
}

.theme-card__preview span:last-child {
  width: 12%;
  opacity: 0.62;
}

.theme-card__copy {
  display: grid;
  gap: 2px;
  min-width: 0;
}

.theme-card__copy strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.theme-card__copy > span,
.theme-card__meta {
  color: var(--maximal-color-text-tertiary, #8f97a2);
  font-size: var(--shell-text-xs, 0.75rem);
  line-height: 1.35;
}

.theme-card__meta {
  text-transform: capitalize;
}

.theme-stack,
.theme-shader-warning,
.theme-preview-notice {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--shell-space-2, 8px);
}

.theme-shader-warning,
.theme-preview-notice {
  justify-content: space-between;
}

.theme-shader-warning > span:first-child,
.theme-preview-notice > span:first-child {
  flex: 1 1 20rem;
}

.theme-stack {
  display: grid;
  grid-template-columns: minmax(9.5rem, 0.85fr) minmax(0, 4.15fr);
  align-items: start;
  gap: var(--shell-space-3, 12px);
}

.theme-stack__current,
.theme-stack__recent {
  display: grid;
  gap: var(--shell-space-2, 8px);
  min-width: 0;
}

.theme-stack__label {
  color: var(--maximal-color-text-secondary, #a0a8b4);
  font-size: var(--shell-text-xs, 0.75rem);
  font-weight: var(--shell-weight-lg, 600);
}

.theme-stack__cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(9.5rem, 1fr));
  gap: var(--shell-space-2, 8px);
}

.theme-stack__ghost {
  display: grid;
  grid-template-rows: 4rem auto;
  gap: var(--shell-space-2, 8px);
  min-height: 6.25rem;
  padding: var(--shell-space-1, 4px);
  border: 1px dashed var(--maximal-color-border-default, #343943);
  border-radius: calc(var(--shell-radius, 6px) + 2px);
  background: color-mix(in srgb, var(--maximal-color-bg-tertiary, #252830) 34%, transparent);
}

.theme-stack__ghost > span:first-child {
  border-radius: var(--shell-radius, 6px);
  background: var(--maximal-color-bg-hover, rgb(255 255 255 / 0.06));
}

.theme-stack__ghost > span:last-child {
  width: 58%;
  height: 0.55rem;
  border-radius: var(--shell-radius-pill, 9999px);
  background: var(--maximal-color-bg-hover, rgb(255 255 255 / 0.06));
}

@media (max-width: 620px) {
  .theme-library-toolbar {
    align-items: stretch;
  }

  .theme-library-toolbar > .input--select,
  .theme-library-toolbar > .input:not(.input--select) {
    flex-basis: 100%;
    max-width: none;
  }

  .theme-library-toolbar__actions {
    margin-inline-start: 0;
  }

  .theme-grid {
    grid-template-columns: minmax(0, 1fr);
  }

  .theme-stack {
    grid-template-columns: minmax(0, 1fr);
  }

  .theme-stack__cards {
    grid-template-columns: repeat(auto-fit, minmax(9.5rem, 1fr));
  }
}

.material-settings {
  padding: var(--shell-space-4, 16px);
  border: 1px solid var(--maximal-color-border-default);
  border-radius: var(--shell-radius-large, 10px);
  background: color-mix(in srgb, var(--maximal-color-bg-secondary) 88%, transparent);
}

.material-settings__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(15rem, 1fr));
  align-items: start;
  gap: var(--shell-space-4, 16px);
}

.material-settings__field--wide,
.material-settings__location {
  grid-column: 1 / -1;
}

.material-settings__location {
  display: grid;
  grid-template-columns: minmax(15rem, 1.5fr) repeat(2, minmax(9rem, 1fr));
  gap: var(--shell-space-3, 12px);
  padding-top: var(--shell-space-3, 12px);
  border-top: 1px solid var(--maximal-color-border-default);
}

.material-settings__solar-direction,
.material-settings__solar-strength {
  grid-column: span 2;
}

.solar-direction {
  display: grid;
  gap: var(--shell-space-2, 8px);
  justify-items: center;
}

.solar-direction__dial {
  position: relative;
  width: min(13rem, 100%);
  aspect-ratio: 1;
  border: 1px solid var(--maximal-color-border-strong);
  border-radius: 50%;
  background:
    radial-gradient(circle, var(--maximal-color-bg-selected) 0 3%, transparent 4%),
    linear-gradient(var(--maximal-color-border-default) 1px, transparent 1px),
    linear-gradient(90deg, var(--maximal-color-border-default) 1px, transparent 1px),
    color-mix(in srgb, var(--maximal-color-bg-secondary) 88%, transparent);
  background-position: center;
  cursor: grab;
  touch-action: none;
}

.solar-direction__dial:active {
  cursor: grabbing;
}

.solar-direction__dial:focus-visible {
  outline: 2px solid var(--maximal-color-border-selected);
  outline-offset: 3px;
}

.solar-direction__dial[aria-disabled='true'] {
  cursor: not-allowed;
  opacity: var(--shell-disabled-opacity, 0.5);
}

.solar-direction__axis {
  --solar-angle: 0;

  position: absolute;
  top: 50%;
  left: 50%;
  width: 42%;
  height: 1px;
  border-top: 1px dashed var(--maximal-color-icon-tertiary);
  transform: rotate(calc(var(--solar-angle, 0) * 1deg));
  transform-origin: left;
}

.solar-direction__calculated,
.solar-direction__sun {
  position: absolute;
  display: grid;
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  transform: translate(-50%, -50%);
  place-items: center;
  pointer-events: none;
}

.solar-direction__calculated {
  border: 2px dashed var(--maximal-color-icon-secondary);
  background: var(--maximal-color-bg-secondary);
}

.solar-direction__sun {
  color: #3b2a00;
  background: #f5c84c;
  box-shadow: 0 0 0 4px rgb(245 200 76 / 0.2), 0 0 18px rgb(245 200 76 / 0.4);
  font-size: 1rem;
}

.solar-direction__legend {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: var(--shell-space-2, 8px) var(--shell-space-3, 12px);
  color: var(--maximal-color-text-secondary);
  font-size: var(--shell-text-xs, 0.75rem);
}

.solar-direction__legend span {
  display: inline-flex;
  gap: var(--shell-space-1, 4px);
  align-items: center;
}

.solar-direction__legend i {
  display: inline-block;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
}

.solar-direction__legend-calculated {
  border: 1px dashed var(--maximal-color-icon-secondary);
}

.solar-direction__legend-adjusted {
  background: #f5c84c;
}

.solar-direction__legend output {
  color: var(--maximal-color-text-default);
  font-variant-numeric: tabular-nums;
}

.solar-direction p {
  max-width: 28rem;
  margin: 0;
  color: var(--maximal-color-text-tertiary);
  font-size: var(--shell-text-xs, 0.75rem);
  text-align: center;
}

.material-settings .input {
  width: 100%;
}

@media (max-width: 760px) {
  .material-settings__grid,
  .material-settings__location {
    grid-template-columns: minmax(0, 1fr);
  }

  .material-settings__solar-direction,
  .material-settings__solar-strength {
    grid-column: auto;
  }
}

.terminal-typography-workbench {
  display: grid;
  grid-template-columns: minmax(30rem, 3fr) minmax(18rem, 2fr);
  gap: var(--shell-space-4, 16px);
  align-items: start;
  width: 100%;
  padding: 0;
}

.terminal-typography-controls {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-3, 12px);
  width: 100%;
  min-width: 0;
}

.terminal-typography-tabs {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--shell-space-1, 4px);
  padding: var(--shell-space-1, 4px);
  border-radius: var(--shell-radius, 4px);
  background: var(--maximal-color-bg-pressed, rgb(255 255 255 / 0.1));
}

.terminal-typography-tabs__tab {
  min-width: 0;
  min-height: var(--shell-control-md, 28px);
  padding: 0 var(--shell-space-2, 8px);
  overflow: hidden;
  color: var(--maximal-color-text-tertiary, #8f97a2);
  font: inherit;
  font-size: var(--shell-text-xs, 0.75rem);
  font-weight: var(--shell-weight-md, 500);
  text-overflow: ellipsis;
  white-space: nowrap;
  border: 0;
  border-radius: var(--shell-radius, 4px);
  background: transparent;
}

.terminal-typography-tabs__tab:hover {
  color: var(--maximal-color-text-default, #e6e8eb);
  background: var(--maximal-color-bg-hover, rgb(255 255 255 / 0.06));
}

.terminal-typography-tabs__tab[aria-selected='true'] {
  color: var(--maximal-color-text-default, #e6e8eb);
  background: var(--maximal-color-bg-tertiary, #252830);
  box-shadow: 0 1px 2px rgb(0 0 0 / 0.2);
}

.terminal-typography-tabs__tab:focus-visible {
  outline: var(--shell-focus-ring-width, 2px) solid var(--maximal-color-border-selected);
  outline-offset: calc(-1 * var(--shell-focus-ring-width, 2px));
}

.terminal-typography-group {
  padding: var(--shell-space-3, 12px);
  border-radius: calc(var(--shell-radius, 6px) + 2px);
  background: var(--maximal-color-bg-tertiary, #252830);
}

.terminal-typography-group__title {
  display: flex;
  gap: var(--shell-space-2, 8px);
  align-items: baseline;
  justify-content: space-between;
}

.terminal-typography-group__title h5 {
  margin: 0;
  color: var(--maximal-color-text-secondary, #a0a8b4);
  font-size: var(--shell-text-sm, 0.8125rem);
  font-weight: 600;
}

.terminal-typography-group__title span {
  overflow: hidden;
  color: var(--maximal-color-text-tertiary, #8f97a2);
  font-size: var(--shell-text-xs, 0.75rem);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-typography-group__fields {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--shell-space-3, 12px) var(--shell-space-5, 20px);
}

.terminal-typography-group__fields--font {
  grid-template-columns: minmax(0, 1fr);
}

.terminal-typography-thicken-controls {
  display: grid;
  grid-template-columns: 6rem minmax(0, 1fr);
  gap: var(--shell-space-3, 12px);
  min-width: 0;
}

.terminal-typography-field[data-disabled='true'] {
  opacity: var(--shell-disabled-opacity, 0.5);
}

.terminal-typography-field {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-1, 4px);
  min-height: 1.5rem;
  min-width: 0;
}

.terminal-typography-field--family,
.terminal-typography-field--switch {
  display: grid;
  grid-template-columns: 6rem minmax(0, 1fr);
  gap: var(--shell-space-2, 8px);
  align-items: center;
}

.terminal-typography-field__heading {
  display: flex;
  min-width: 0;
  align-items: center;
  justify-content: space-between;
}

.terminal-typography-field__heading output {
  color: var(--maximal-color-text-tertiary, #8f97a2);
  font-size: var(--shell-text-sm, 0.8125rem);
  font-variant-numeric: tabular-nums;
}

.terminal-typography-field__label {
  color: var(--maximal-color-text-secondary, #a0a8b4);
  font-size: var(--shell-text-sm, 0.8125rem);
  font-weight: 500;
}

.terminal-typography-field select {
  width: 100%;
  min-width: 0;
}

.terminal-typography-field__slider,
.terminal-typography-field__size {
  display: block;
  min-width: 0;
}

.terminal-typography-field__heading .number-input {
  width: 4rem;
  text-align: right;
  font-variant-numeric: tabular-nums;
}

.terminal-typography-field__number {
  display: flex;
  gap: var(--shell-space-1, 4px);
  align-items: center;
  color: var(--maximal-color-text-tertiary, #8f97a2);
  font-size: var(--shell-text-xs, 0.75rem);
}

.terminal-typography-field .slider {
  min-width: 0;
}

.terminal-typography-field .slider__root {
  height: 1.25rem;
}

.terminal-typography-field .slider__detents {
  right: 0.5rem;
  left: 0.5rem;
}

.terminal-typography-field .slider__thumb {
  position: relative;
  width: 1rem;
  height: 1rem;
  border-color: var(--maximal-color-bg-default, #111318);
  background: var(--maximal-color-icon-default, #e6e8eb);
  box-shadow: 0 0 0 1px var(--maximal-color-border-strong, #515a69);
}

.terminal-typography-field .slider__thumb::after {
  position: absolute;
  content: '';
  inset: -0.375rem;
}

.terminal-typography-axes,
.terminal-typography-features {
  grid-column: 1 / -1;
}

.terminal-typography-axes {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-3, 12px);
  margin-top: var(--shell-space-1, 4px);
  padding-top: var(--shell-space-3, 12px);
}

.terminal-typography-features {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: var(--shell-space-2, 8px) var(--shell-space-4, 16px);
}

.terminal-typography-features > label {
  display: flex;
  gap: var(--shell-space-3, 12px);
  align-items: center;
  justify-content: space-between;
  min-width: 0;
  padding: var(--shell-space-2, 8px) 0;
}

.terminal-typography-features > label > span {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.terminal-typography-features strong {
  color: var(--maximal-color-text-default, #e6e8eb);
  font-size: var(--shell-text-sm, 0.8125rem);
  font-weight: 500;
}

.terminal-typography-features small {
  overflow: hidden;
  color: var(--maximal-color-text-tertiary, #8f97a2);
  font-size: var(--shell-text-xs, 0.75rem);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-typography-field .switch__track {
  width: 1.75rem;
  height: 1rem;
}

.terminal-typography-field .switch__thumb {
  width: 0.75rem;
  height: 0.75rem;
}

.terminal-typography-field .switch__track[data-on='true'] .switch__thumb {
  transform: translateX(0.75rem);
}

.terminal-typography-controls__note {
  margin: var(--shell-space-1, 4px) 0 0;
  color: var(--maximal-color-text-tertiary, #8f97a2);
  font-size: var(--shell-text-sm, 0.8125rem);
}

.terminal-palette-controls {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-3, 12px);
  min-width: 0;
}

.terminal-palette-toolbar {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--shell-space-4, 16px);
}

.terminal-palette-toolbar label {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--shell-space-2, 8px);
  align-items: center;
  color: var(--maximal-color-text-secondary, #a0a8b4);
  font-size: var(--shell-text-sm, 0.8125rem);
}

.appearance-file-input {
  display: none;
}

.account-person-card {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: var(--shell-space-3, 12px);
}

.account-person-card__identity {
  display: flex;
  flex: 1 1 12rem;
  align-items: center;
  min-width: 0;
  gap: var(--shell-space-3, 12px);
}

.account-person-card__copy {
  display: grid;
  min-width: 0;
  gap: var(--shell-space-1, 4px);
}

.account-person-card__actions {
  display: flex;
  flex-shrink: 0;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--shell-space-2, 8px);
  margin-inline-start: auto;
}

.account-avatar {
  display: inline-flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  color: inherit;
  background: transparent;
  border: 0;
  border-radius: 50%;
  box-shadow: none;
  transition: box-shadow 150ms ease, border-color 150ms ease;
}

.account-avatar--small {
  width: 30px;
  height: 30px;
}

.account-avatar--large {
  width: 44px;
  height: 44px;
}

.account-avatar__image {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.terminal-palette-preview-frame {
  padding: var(--shell-space-4, 16px);
  overflow: hidden;
  border-radius: calc(var(--shell-radius, 6px) + 2px);
  background: var(--maximal-color-bg-tertiary, #252830);
}

.terminal-palette-preview {
  display: grid;
  gap: var(--shell-space-2, 8px);
  padding: var(--shell-space-4, 16px);
  overflow: hidden;
  border-radius: var(--shell-radius, 6px);
  font: 400 0.875rem/1.45 ui-monospace, SFMono-Regular, Menlo, monospace;
}

.terminal-palette-preview strong {
  font-weight: 600;
}

.terminal-palette-preview__swatches {
  display: grid;
  grid-template-columns: repeat(8, minmax(0, 1fr));
  gap: 2px;
}

.terminal-palette-preview__swatches span {
  min-height: 0.625rem;
  border-radius: 2px;
}

.terminal-palette-primary,
.terminal-palette-ansi > div {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: var(--shell-space-2, 8px);
}

.terminal-palette-colour {
  display: grid;
  grid-template-columns: 1.75rem minmax(0, 1fr);
  grid-template-areas:
    'swatch label'
    'swatch value';
  gap: 0 var(--shell-space-2, 8px);
  align-items: center;
  min-width: 0;
  padding: var(--shell-space-2, 8px);
  border-radius: var(--shell-radius, 6px);
  background: var(--maximal-color-bg-tertiary, #252830);
  font-size: var(--shell-text-sm, 0.8125rem);
}

.terminal-color-picker__trigger {
  width: 1.75rem;
  height: 1.75rem;
  padding: 0;
  border: 1px solid var(--maximal-color-bg-tertiary, #252830);
  border-radius: var(--shell-radius-small, 4px);
  box-shadow: 0 0 0 1px var(--maximal-color-border-strong, #515a69);
  cursor: pointer;
}

.terminal-palette-colour .terminal-color-picker__trigger {
  grid-area: swatch;
}

.terminal-color-picker {
  position: fixed;
  z-index: 101;
  top: 50%;
  left: 50%;
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-4, 16px);
  width: min(28rem, calc(100vw - 2rem));
  max-height: calc(100vh - 2rem);
  padding: var(--shell-space-4, 16px);
  overflow: auto;
  border: 1px solid var(--maximal-color-border-strong, #515a69);
  border-radius: var(--shell-radius-large, 8px);
  background: var(--maximal-color-bg-tertiary, #252830);
  box-shadow: var(--shell-elevation, 0 18px 50px rgb(0 0 0 / 0.45));
  transform: translate(-50%, -50%);
}

.terminal-color-picker__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.terminal-color-picker__header strong {
  color: var(--maximal-color-text-default, #e6e8eb);
  font-size: var(--shell-text-md, 1rem);
  font-weight: var(--shell-weight-lg, 600);
}

.terminal-color-picker__close {
  display: grid;
  width: 2rem;
  height: 2rem;
  padding: 0;
  border: 0;
  border-radius: var(--shell-radius, 6px);
  color: var(--maximal-color-text-secondary, #a0a8b4);
  background: transparent;
  cursor: pointer;
  place-items: center;
}

.terminal-color-picker__close:hover {
  color: var(--maximal-color-text-default, #e6e8eb);
  background: var(--maximal-color-bg-hover, rgb(255 255 255 / 0.06));
}

.terminal-color-picker__saturation {
  position: relative;
  width: 100%;
  aspect-ratio: 1.08;
  overflow: hidden;
  border: 1px solid var(--maximal-color-border-strong, #515a69);
  border-radius: var(--shell-radius, 6px);
  cursor: crosshair;
  touch-action: none;
}

.terminal-color-picker__saturation > span {
  position: absolute;
  width: 1rem;
  height: 1rem;
  border: 2px solid #fff;
  border-radius: 50%;
  box-shadow: 0 0 0 1px #111;
  transform: translate(-50%, -50%);
  pointer-events: none;
}

.terminal-color-picker__hue {
  display: grid;
  grid-template-columns: 2.5rem minmax(0, 1fr);
  gap: var(--shell-space-3, 12px);
  align-items: center;
  color: var(--maximal-color-text-secondary, #a0a8b4);
  font-size: var(--shell-text-sm, 0.8125rem);
}

.terminal-color-picker__hue input[type='range'] {
  width: 100%;
  height: 1rem;
  margin: 0;
  appearance: none;
  border: 1px solid var(--maximal-color-border-strong, #515a69);
  border-radius: var(--shell-radius-pill, 9999px);
  background:
    linear-gradient(
      to right,
      #f00,
      #ff0,
      #0f0,
      #0ff,
      #00f,
      #f0f,
      #f00
    );
}

.terminal-color-picker__hue input[type='range']::-webkit-slider-thumb {
  width: 1.25rem;
  height: 1.25rem;
  appearance: none;
  border: 3px solid #fff;
  border-radius: 50%;
  background: transparent;
  box-shadow: 0 0 0 1px #111;
  cursor: grab;
}

.terminal-color-picker__value {
  display: grid;
  grid-template-columns: 2.5rem minmax(0, 1fr) auto;
  gap: var(--shell-space-3, 12px);
  align-items: center;
  color: var(--maximal-color-text-secondary, #a0a8b4);
  font-size: var(--shell-text-sm, 0.8125rem);
}

.terminal-color-picker__value input {
  width: 100%;
  min-width: 0;
  height: var(--shell-control-lg, 32px);
  padding: 0 var(--shell-space-2, 8px);
  border: 1px solid var(--maximal-color-border-strong, #515a69);
  border-radius: var(--shell-radius, 6px);
  color: var(--maximal-color-text-default, #e6e8eb);
  background: var(--maximal-color-bg-default, #171a20);
  font: 500 var(--shell-text-base, 0.875rem)/1 var(--shell-font-mono, monospace);
  text-transform: uppercase;
}

.terminal-color-picker__value output {
  color: var(--maximal-color-text-tertiary, #8f97a2);
  font: 400 var(--shell-text-xs, 0.75rem)/1 var(--shell-font-mono, monospace);
}

.terminal-palette-colour span {
  grid-area: label;
  overflow: hidden;
  color: var(--maximal-color-text-default, #e6e8eb);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-palette-colour output {
  grid-area: value;
  color: var(--maximal-color-text-tertiary, #8f97a2);
  font: 400 var(--shell-text-xs, 0.75rem)/1.2 ui-monospace, monospace;
}

.terminal-palette-ansi {
  border-radius: calc(var(--shell-radius, 6px) + 2px);
  background: var(--maximal-color-bg-tertiary, #252830);
}

.terminal-palette-ansi summary {
  padding: var(--shell-space-3, 12px);
  color: var(--maximal-color-text-secondary, #a0a8b4);
  font-size: var(--shell-text-sm, 0.8125rem);
  font-weight: 600;
  cursor: pointer;
}

.terminal-palette-ansi > div {
  padding: 0 var(--shell-space-3, 12px) var(--shell-space-3, 12px);
}

.terminal-palette-effects {
  padding: var(--shell-space-3, 12px);
  border-radius: calc(var(--shell-radius, 6px) + 2px);
  background: var(--maximal-color-bg-tertiary, #252830);
}

.terminal-palette-effects__header {
  margin-bottom: var(--shell-space-3, 12px);
}

.terminal-palette-effects__header h4 {
  margin: 0;
  color: var(--maximal-color-text-default, #e6e8eb);
  font-size: var(--shell-text-sm, 0.8125rem);
  font-weight: 600;
}

.terminal-palette-effects__header p {
  max-width: 58ch;
  margin: var(--shell-space-1, 4px) 0 0;
  color: var(--maximal-color-text-tertiary, #8f97a2);
  font-size: var(--shell-text-xs, 0.75rem);
  line-height: var(--shell-leading-base, 1.5);
}

.terminal-palette-effects__grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--shell-space-3, 12px) var(--shell-space-5, 20px);
}

.terminal-palette-field {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-1, 4px);
  min-width: 0;
}

.terminal-palette-field .slider__root {
  height: 1.25rem;
}

.terminal-palette-field .slider__thumb {
  width: 1rem;
  height: 1rem;
  border-color: var(--maximal-color-bg-default, #111318);
  background: var(--maximal-color-icon-default, #e6e8eb);
  box-shadow: 0 0 0 1px var(--maximal-color-border-strong, #515a69);
}

.terminal-palette-field[data-disabled='true'] {
  opacity: var(--shell-disabled-opacity, 0.5);
}

.terminal-palette-field__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  color: var(--maximal-color-text-secondary, #a0a8b4);
  font-size: var(--shell-text-sm, 0.8125rem);
}

.terminal-palette-field__heading output {
  color: var(--maximal-color-text-tertiary, #8f97a2);
  font-variant-numeric: tabular-nums;
}

.terminal-palette-field--tint {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: center;
}

.terminal-palette-field--tint > span {
  color: var(--maximal-color-text-secondary, #a0a8b4);
  font-size: var(--shell-text-sm, 0.8125rem);
}

.terminal-palette-effects__switches {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: var(--shell-space-3, 12px);
  margin-top: var(--shell-space-4, 16px);
  padding-top: var(--shell-space-3, 12px);
}

.terminal-palette-effects__switches > label {
  display: flex;
  gap: var(--shell-space-3, 12px);
  align-items: center;
  justify-content: space-between;
}

.terminal-palette-effects__switches span {
  display: flex;
  flex-direction: column;
}

.terminal-palette-effects__switches strong {
  color: var(--maximal-color-text-default, #e6e8eb);
  font-size: var(--shell-text-sm, 0.8125rem);
}

.terminal-palette-effects__switches small {
  color: var(--maximal-color-text-tertiary, #8f97a2);
  font-size: var(--shell-text-xs, 0.75rem);
}

@media (max-width: 64rem) {
  .terminal-typography-workbench {
    grid-template-columns: minmax(0, 1fr);
  }
}

@media (max-width: 46rem) {
  .terminal-typography-group__fields {
    grid-template-columns: minmax(0, 1fr);
  }

  .terminal-palette-toolbar,
  .terminal-palette-effects__grid,
  .terminal-palette-effects__switches {
    grid-template-columns: minmax(0, 1fr);
  }

  .terminal-palette-primary,
  .terminal-palette-ansi > div {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .terminal-typography-features {
    grid-template-columns: minmax(0, 1fr);
  }
}

.terminal-typography-preview {
  display: grid;
  grid-template-rows: minmax(0, 1fr) auto;
  min-width: 0;
  max-height: calc(var(--shell-control-lg, 32px) * 9);
  overflow: hidden;
  border-radius: var(--shell-radius, 6px);
  background: #111318;
}

.terminal-typography-preview--compact {
  min-height: calc(var(--shell-control-lg, 32px) * 7);
}

.terminal-typography-preview__proof {
  display: grid;
  align-content: center;
  gap: var(--shell-space-4, 16px);
  min-width: 0;
  height: 100%;
  padding: var(--shell-space-5, 20px);
  overflow: hidden;
  background:
    linear-gradient(rgb(255 255 255 / 0.025) 1px, transparent 1px),
    linear-gradient(90deg, rgb(255 255 255 / 0.025) 1px, transparent 1px),
    #181713;
  background-size:
    var(--shell-space-5, 20px) var(--shell-space-5, 20px);
  color: #f2ead3;
}

.terminal-typography-preview__proof-label {
  color: #968d78;
  font: 600 var(--shell-text-xs, 0.75rem)/1 ui-monospace, monospace;
  letter-spacing: 0.04em;
}

.terminal-typography-preview__proof strong,
.terminal-typography-preview__proof > span:last-child {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-typography-preview__proof strong {
  font-size: clamp(1.5rem, 3vw, 2.75rem) !important;
}

.terminal-typography-preview__image {
  display: block;
  width: 100%;
  height: 100%;
  min-height: 0;
  object-fit: cover;
  object-position: top;
}

.terminal-typography-preview__variation {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: var(--shell-space-4, 16px);
  align-items: center;
  min-height: 3.5rem;
  padding: var(--shell-space-2, 8px) var(--shell-space-3, 12px);
  border-top: 1px solid #332f27;
  background: #181713;
  color: #f2ead3;
}

.terminal-typography-preview__variation-label {
  color: #968d78;
  font: 600 0.75rem/1 ui-monospace, monospace;
  letter-spacing: 0.04em;
}

.terminal-typography-preview__variation-sample {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.terminal-typography-preview__placeholder {
  display: grid;
  width: 100%;
  aspect-ratio: 1200 / 620;
  place-items: center;
  padding: var(--shell-space-4, 16px);
  color: var(--maximal-color-text-secondary, #a0a8b4);
  background:
    linear-gradient(
      100deg,
      transparent 30%,
      rgb(255 255 255 / 0.05) 50%,
      transparent 70%
    )
    #181713;
  background-size: 200% 100%;
  font-size: var(--shell-text-sm, 0.8125rem);
  text-align: center;
  animation: terminal-typography-preview-loading 1.4s ease-in-out infinite;
}

@keyframes terminal-typography-preview-loading {
  from { background-position: 100% 0; }
  to { background-position: -100% 0; }
}

@media (prefers-reduced-motion: reduce) {
  .terminal-typography-preview__placeholder {
    animation: none;
  }
}

.terminal-typography-preview-window {
  box-sizing: border-box;
  width: 100vw;
  height: 100vh;
  padding: var(--shell-space-4, 16px);
  background: var(--maximal-color-bg-default, #17191f);
}

.terminal-typography-preview-window .terminal-typography-preview {
  display: grid;
  height: 100%;
  max-height: none;
  place-items: center;
}

.terminal-typography-preview-window .terminal-typography-preview__image {
  max-height: 100%;
  object-fit: contain;
}

.terminal-font-downloads {
  overflow: hidden;
  border-radius: var(--shell-radius, 6px);
  background: var(--maximal-color-bg-tertiary, #24272f);
}

.terminal-font-downloads .settings-disclosure {
  border-bottom: 0;
}

.terminal-font-downloads .settings-disclosure__body {
  padding: 0;
}

.terminal-font-downloads .settings__group {
  border-radius: 0;
}

.terminal-font-specimen {
  display: block;
  width: min(20rem, 45vw);
  height: 2rem;
  object-fit: contain;
  object-position: left center;
}

@media (max-width: 800px) {
  .terminal-typography-workbench {
    width: 100%;
  }
}

.sb-shell .settings__section > :not(.settings__section-title):not(.settings__description),
.settings-subsection > :not(.settings-section__subheading) {
  max-width: calc(100% - var(--shell-space-2, 8px));
  margin-inline-start: var(--shell-space-2, 8px);
}

.settings-connector-form,
.settings-connector-fields,
.settings-connector-field {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.settings-connector-form {
  gap: var(--shell-space-5, 24px);
}

.settings-connector-fields {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 240px), 1fr));
  gap: var(--shell-space-4, 16px);
}

.search-provider-order__fallback {
  margin-inline: calc(var(--shell-space-4, 16px) + 2px);
}

.search-behavior {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-4, 16px);
  width: min(100%, 52rem);
}

.search-behavior__domains {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(min(100%, 20rem), 1fr));
  gap: var(--shell-space-4, 16px);
  min-width: 0;
}

.search-behavior__field {
  min-width: 0;
}

.search-behavior__help {
  width: 20px;
  height: 20px;
  padding: 0;
}

.search-behavior__switch-label {
  display: inline-flex;
  align-items: center;
  gap: var(--shell-space-1, 4px);
}

.settings-connector-field {
  align-items: flex-start;
  gap: var(--shell-space-2, 8px);
}

.settings-connector-field[data-layout='full'] {
  grid-column: 1 / -1;
}

.settings-details {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-1, 4px);
  margin: 0;
}

.settings-details__row {
  display: flex;
  align-items: baseline;
  gap: var(--shell-space-2, 8px);
}

.settings-details__row dt {
  margin: 0;
  min-width: 9em;
  font-size: var(--shell-text-sm, 0.9em);
  color: var(--maximal-color-text-tertiary, #8f97a2);
}

.settings-details__row dd {
  margin: 0;
  font-size: var(--shell-text-sm, 0.9em);
  color: var(--maximal-color-text-default, #f5f5f5);
}

.settings-link-button {
  padding: 0;
  border: none;
  background: none;
  color: var(--maximal-color-text-brand, #5198a6);
  font: inherit;
  font-size: inherit;
  text-decoration: underline;
  cursor: pointer;
}

.settings-link-button:focus-visible {
  outline: 2px solid var(--maximal-color-border-selected, var(--maximal-color-border-brand, #5198a6));
  outline-offset: 2px;
}

.settings-device-code {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: var(--shell-space-2, 8px);
}

.settings-device-code__code {
  display: flex;
  align-items: center;
  gap: var(--shell-space-3, 12px);
  margin: 0;
  padding: var(--shell-space-2, 8px) var(--shell-space-4, 16px);
  border: 1px solid transparent;
  border-radius: var(--shell-radius, 6px);
  background: var(--maximal-color-bg-hover, rgb(255 255 255 / 0.06));
  color: inherit;
  cursor: pointer;
  font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace;
  font-size: 1.5em;
  font-weight: 700;
  letter-spacing: 0.08em;
}

.settings-device-code__code:hover {
  border-color: var(--maximal-color-border-strong-hover, var(--maximal-color-border-brand, #5198a6));
}

.settings-device-code__code:focus-visible {
  outline: 2px solid var(--maximal-color-border-selected, var(--maximal-color-border-brand, #5198a6));
  outline-offset: 2px;
}

.settings-device-code__code:disabled {
  cursor: default;
  opacity: var(--shell-disabled-opacity, 0.5);
}

.settings-device-code__copied {
  color: var(--maximal-color-text-brand, #5198a6);
  font-family: var(--shell-font, system-ui, sans-serif);
  font-size: var(--shell-text-sm, 0.8125rem);
  font-weight: var(--shell-weight-md, 500);
  letter-spacing: normal;
}

.settings-device-code__link-row {
  margin: 0;
}

.settings-device-code__actions {
  display: flex;
  gap: var(--shell-space-2, 8px);
}

.settings-subsection {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-2, 8px);
  min-width: 0;
}

.settings-section__subheading {
  margin: 0;
  color: var(--maximal-color-text-default, #f5f5f5);
  font-size: var(--shell-text-lg, 1.0625rem);
  font-weight: var(--shell-weight-lg, 600);
}

.settings-disclosure-list {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-1, 4px);
  margin: 0;
  padding: var(--shell-space-2, 8px);
  border: 1px solid var(--maximal-color-border-strong, var(--maximal-color-border-default, #2a2a2a));
  border-radius: var(--shell-radius, 6px);
  list-style: none;
}

.settings-disclosure-card {
  border: 1px solid transparent;
  border-radius: var(--shell-radius, 6px);
  background: var(--maximal-color-bg-hover, rgb(255 255 255 / 0.06));
}

.settings-disclosure-card > summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: var(--shell-space-2, 8px);
  min-height: var(--shell-control-lg, 36px);
  padding: var(--shell-space-2, 8px);
  cursor: pointer;
  list-style: none;
}

.settings-disclosure-card > summary::-webkit-details-marker {
  display: none;
}

.settings-disclosure-card > summary:focus-visible {
  outline: 2px solid var(--maximal-color-border-selected, var(--maximal-color-border-brand, #5198a6));
  outline-offset: 2px;
}

.settings-disclosure-card__chevron {
  color: var(--maximal-color-text-secondary, #a0a8b4);
  transition: transform 120ms ease-out;
}

.settings-disclosure-card[open] .settings-disclosure-card__chevron {
  transform: rotate(90deg);
}

.settings-disclosure-card__summary,
.settings-disclosure-card__body {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.settings-disclosure-card__summary {
  gap: 2px;
}

.settings-disclosure-card__body {
  gap: var(--shell-space-2, 8px);
  padding:
    var(--shell-space-3, 12px)
    var(--shell-space-3, 12px)
    var(--shell-space-4, 16px)
    calc(var(--shell-space-2, 8px) + 16px + var(--shell-space-2, 8px));
  border-top: 1px solid var(--maximal-color-border-default, #2a2a2a);
}

@media (prefers-reduced-motion: reduce) {
  .settings-disclosure-card__chevron {
    transition: none;
  }
}

.settings-advanced > summary {
  width: fit-content;
  font-size: var(--shell-text-sm, 0.9em);
  font-weight: 600;
  cursor: pointer;
}

.settings-advanced > summary:focus-visible {
  outline: 2px solid var(--maximal-color-border-selected, var(--maximal-color-border-brand, #5198a6));
  outline-offset: 2px;
}

.settings-section__actions,
.settings-copy-value,
.settings-dialog__actions,
.settings-periods {
  display: flex;
  align-items: center;
  gap: var(--shell-space-2, 8px);
  flex-wrap: wrap;
}

.settings-section__actions,
.settings-periods {
  justify-content: flex-end;
}

.settings-credential-field {
  display: flex;
  align-items: center;
  width: 100%;
  gap: var(--shell-space-2, 8px);
  flex-wrap: wrap;
}

.settings-credential-field .input-shell {
  min-width: min(100%, 16rem);
  flex: 1;
}

.settings-credential-input {
  display: flex;
  min-width: min(100%, 24rem);
  flex: 1 1 24rem;
}

.settings-credential-field > .btn {
  flex-shrink: 0;
}

.settings-credential-input .input-shell {
  min-width: 0;
  width: 100%;
}

.settings-dialog__heading {
  margin: 0;
  font-size: 1.1em;
}

.settings-dialog__actions {
  justify-content: flex-end;
}

.settings-list {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-2, 8px);
  margin: 0;
  padding: 0;
  list-style: none;
}

.settings-list__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--shell-space-3, 12px);
  padding: var(--shell-space-2, 8px) 0;
  border-bottom: 1px solid var(--maximal-color-border-default, #2a2a2a);
}

.settings-list__content {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-1, 4px);
  min-width: 0;
}

.settings-list__meta,
.settings-list__detail {
  color: var(--maximal-color-text-tertiary, #8f97a2);
  font-size: var(--shell-text-sm, 0.9em);
}

.settings-list__detail,
.settings-copy-value code,
.settings-code-block code {
  overflow-wrap: anywhere;
}

.settings-code-block {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: var(--shell-space-2, 8px);
  padding: var(--shell-space-3, 12px);
  border: 1px solid var(--maximal-color-border-default, #2a2a2a);
  border-radius: var(--shell-radius, 6px);
  min-width: 0;
}

.settings-wide-content,
.settings-table-wrap {
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
}

.settings-table-wrap:focus-visible {
  outline: 2px solid var(--maximal-color-border-selected, var(--maximal-color-border-brand, #5198a6));
  outline-offset: 2px;
}

.settings-metrics {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
  gap: var(--shell-space-2, 8px);
  margin: 0;
}

.settings-metrics > div {
  display: flex;
  flex-direction: column;
  gap: var(--shell-space-1, 4px);
}

.settings-metrics dt,
.settings-metrics dd {
  margin: 0;
}

.settings-metrics dt {
  color: var(--maximal-color-text-tertiary, #8f97a2);
  font-size: var(--shell-text-sm, 0.9em);
}

.settings-metrics dd {
  font-size: 1.15em;
  font-weight: 600;
}

.settings-table {
  width: 100%;
  min-width: 440px;
  border-collapse: collapse;
  font-size: var(--shell-text-base, 0.875rem);
  text-align: left;
}

.settings-table--models {
  min-width: 560px;
  table-layout: fixed;
}

.settings-table__type-column {
  width: 56px;
}

.settings-table__token-column {
  width: 112px;
}

.settings-table__capability-column {
  width: 152px;
}

.settings-table caption {
  padding: var(--shell-space-2, 8px) 0;
  font-size: var(--shell-text-base, 0.875rem);
  font-weight: var(--shell-weight-lg, 600);
  text-align: left;
}

.settings-table th,
.settings-table td {
  padding: var(--shell-space-2, 8px);
  border-bottom: 1px solid var(--maximal-color-border-default, #2a2a2a);
  vertical-align: top;
}

.settings-table thead th {
  color: var(--maximal-color-text-secondary, #8a8a8a);
  font-size: var(--shell-text-sm, 0.8125rem);
  font-weight: var(--shell-weight-lg, 600);
  white-space: nowrap;
}

.settings-table tbody th {
  font-weight: var(--shell-weight-md, 500);
}

.settings-table__number {
  text-align: right;
  font-variant-numeric: tabular-nums;
  white-space: nowrap;
}

.settings-table__capabilities {
  display: flex;
  align-items: center;
  gap: var(--shell-space-2, 8px);
}

.settings-table__icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--maximal-color-text-secondary, #8a8a8a);
}

.settings-table__type {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--maximal-color-text-secondary, #8a8a8a);
}

.settings-table__model-name,
.settings-table--models code {
  display: block;
}

.settings-table--models code {
  margin-top: var(--shell-space-1, 4px);
  color: var(--maximal-color-text-secondary, #8a8a8a);
  font-size: var(--shell-text-sm, 0.8125rem);
  font-weight: 400;
}

.settings-visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
`

const SETTINGS_STYLE_ID = 'settings-styles'

export function ensureSettingsStyles(): void {
  const existing = document.getElementById(SETTINGS_STYLE_ID)
  if (existing !== null) {
    if (existing.textContent !== SETTINGS_CSS)
      existing.textContent = SETTINGS_CSS
    return
  }

  const style = document.createElement('style')
  style.id = SETTINGS_STYLE_ID
  style.textContent = SETTINGS_CSS
  document.head.appendChild(style)
}
