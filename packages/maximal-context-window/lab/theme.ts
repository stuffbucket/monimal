/*
 * The `--shell-*` palette used to preview this package's components against
 * a real theme. The shell design system ships no palette by design (a host
 * defines it); this mirrors the same values `packages/maximal/client` uses so
 * the lab looks like the real application, not an unstyled document.
 */
const THEME_CSS = `
:root {
  color-scheme: dark;
  --shell-background: #16181d;
  --shell-canvas: #1c1f26;
  --shell-raised: #262a33;
  --shell-text: #f5f5f5;
  --shell-text-muted: #a0a8b4;
  --shell-text-subtle: #8f97a2;
  --shell-border: #343943;
  --shell-border-strong: #515a69;
  --shell-input-background: #171a20;
  --shell-border-hover: var(--shell-accent);
  --shell-hover: rgb(255 255 255 / 0.06);
  --shell-active: rgb(255 255 255 / 0.1);
  --shell-accent: #5198a6;
  --shell-accent-contrast: #16181d;
  --shell-accent-muted: rgb(81 152 166 / 0.12);
  --shell-focus: var(--shell-accent);
  --shell-font:
    400 1rem/1.5 -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui,
    sans-serif;
  --shell-danger: #ef4444;
  --shell-warning: #eab308;
}

/* Light-mode override, toggled by setting \`data-theme="light"\` on any
   ancestor element (the lab toggles it on its own root \`div\`). Values
   mirror \`packages/maximal-electron\`'s \`tokens.css\` light block so
   the lab exercises the same palette a real light-themed host would
   supply, not just the dark one above. */
[data-theme='light'] {
  color-scheme: light;
  --shell-background: #ffffff;
  --shell-canvas: #eef0f4;
  --shell-raised: #ffffff;
  --shell-text: #12141a;
  --shell-text-muted: #545c68;
  --shell-text-subtle: #656d78;
  --shell-border: #e3e6eb;
  --shell-border-strong: #ccd2da;
  --shell-input-background: #ffffff;
  --shell-hover: #eceef2;
  --shell-active: #e2e6ec;
  --shell-accent: #2563eb;
  --shell-accent-contrast: #ffffff;
  --shell-accent-muted: rgb(37 99 235 / 0.1);
  --shell-danger: #c0272b;
  --shell-warning: #a9691b;
}

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

.lab-shell {
  max-width: 28rem;
  height: 100%;
  padding: var(--shell-space-4, 1rem);
  box-sizing: border-box;
  color: var(--shell-text);
  background: var(--shell-background);
}
`

const THEME_STYLE_ID = "maximal-context-window-lab-theme"

if (!document.querySelector(`#${THEME_STYLE_ID}`)) {
  const style = document.createElement("style")
  style.id = THEME_STYLE_ID
  style.textContent = THEME_CSS
  document.head.append(style)
}
