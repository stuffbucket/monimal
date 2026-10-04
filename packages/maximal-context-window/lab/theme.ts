/*
 * The `--maximal-color-*` palette used to preview this package's components against
 * a real theme. The shell design system ships no palette by design (a host
 * defines it); this mirrors the same values `packages/maximal-client/src/renderer` uses so
 * the lab looks like the real application, not an unstyled document.
 */
const THEME_CSS = `
:root {
  color-scheme: dark;
  --maximal-color-bg-default: #16181d;
  --maximal-color-bg-secondary: #1c1f26;
  --maximal-color-bg-tertiary: #262a33;
  --maximal-color-bg-hover: rgb(255 255 255 / 0.06);
  --maximal-color-bg-pressed: rgb(255 255 255 / 0.1);
  --maximal-color-bg-selected: rgb(81 152 166 / 0.12);
  --maximal-color-bg-brand: #5198a6;
  --maximal-color-bg-danger: #ef4444;
  --maximal-color-bg-warning: #eab308;
  --maximal-color-bg-success: #22c55e;
  --maximal-color-text-default: #f5f5f5;
  --maximal-color-text-secondary: #a0a8b4;
  --maximal-color-text-tertiary: #8f97a2;
  --maximal-color-text-onbrand: #16181d;
  --maximal-color-border-default: #343943;
  --maximal-color-border-strong: #515a69;
  --shell-font:
    400 1rem/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui,
    sans-serif;
  --data-viz-series-1: #64b5c4;
  --data-viz-series-2: #77b96f;
  --data-viz-series-3: #d0a24c;
  --data-viz-series-4: #d27a8b;
  --data-viz-series-5: #789ee8;
  --data-viz-series-6: #b58ad6;
  --data-viz-series-7: #d8835f;
  --data-viz-series-8: #84919f;
}

/* Light-mode override, toggled by setting \`data-theme="light"\` on any
   ancestor element (the lab toggles it on its own root \`div\`). Values
   mirror \`packages/maximal-electron\`'s \`tokens.css\` light block so
   the lab exercises the same palette a real light-themed host would
   supply, not just the dark one above. */
[data-theme='light'] {
  color-scheme: light;
  --maximal-color-bg-default: #ffffff;
  --maximal-color-bg-secondary: #eef0f4;
  --maximal-color-bg-tertiary: #ffffff;
  --maximal-color-bg-hover: #eceef2;
  --maximal-color-bg-pressed: #e2e6ec;
  --maximal-color-bg-selected: rgb(37 99 235 / 0.1);
  --maximal-color-bg-brand: #2563eb;
  --maximal-color-bg-danger: #c0272b;
  --maximal-color-bg-warning: #a9691b;
  --maximal-color-bg-success: #257a3e;
  --maximal-color-text-default: #12141a;
  --maximal-color-text-secondary: #545c68;
  --maximal-color-text-tertiary: #656d78;
  --maximal-color-text-onbrand: #ffffff;
  --maximal-color-border-default: #e3e6eb;
  --maximal-color-border-strong: #ccd2da;
  --data-viz-series-1: #176b78;
  --data-viz-series-2: #397a33;
  --data-viz-series-3: #8a5d00;
  --data-viz-series-4: #9e3653;
  --data-viz-series-5: #345fba;
  --data-viz-series-6: #74449a;
  --data-viz-series-7: #a64d28;
  --data-viz-series-8: #53606e;
}

/* Roles derived from the base values. Declared wherever data-theme is, so
   they resolve against the light values inside the lab's own root. */
:root,
[data-theme] {
  --maximal-color-bg-onbrand: var(--maximal-color-text-onbrand);
  --maximal-color-text-brand: var(--maximal-color-bg-brand);
  --maximal-color-text-danger: var(--maximal-color-bg-danger);
  --maximal-color-text-warning: var(--maximal-color-bg-warning);
  --maximal-color-text-success: var(--maximal-color-bg-success);
  --maximal-color-icon-default: var(--maximal-color-text-default);
  --maximal-color-icon-secondary: var(--maximal-color-text-secondary);
  --maximal-color-icon-tertiary: var(--maximal-color-text-tertiary);
  --maximal-color-icon-brand: var(--maximal-color-bg-brand);
  --maximal-color-border-strong-hover: var(--maximal-color-bg-brand);
  --maximal-color-border-brand: var(--maximal-color-bg-brand);
  --maximal-color-border-selected: var(--maximal-color-bg-brand);
  --maximal-color-border-danger: var(--maximal-color-bg-danger);
  --maximal-color-border-danger-strong: var(--maximal-color-bg-danger);
  --maximal-color-border-warning: var(--maximal-color-bg-warning);
  --maximal-color-border-success: var(--maximal-color-bg-success);
}

html,
body,
#root {
  height: 100%;
  margin: 0;
}

html,
body {
  color: var(--maximal-color-text-default);
  background: var(--maximal-color-bg-default);
  font: var(--shell-font);
}

.lab-shell {
  max-width: 28rem;
  height: 100%;
  padding: var(--shell-space-4, 1rem);
  box-sizing: border-box;
  color: var(--maximal-color-text-default);
  background: var(--maximal-color-bg-default);
}
`

const THEME_STYLE_ID = "maximal-context-window-lab-theme"

if (!document.querySelector(`#${THEME_STYLE_ID}`)) {
  const style = document.createElement("style")
  style.id = THEME_STYLE_ID
  style.textContent = THEME_CSS
  document.head.append(style)
}
