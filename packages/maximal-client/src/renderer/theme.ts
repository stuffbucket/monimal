/*
 * The `--shell-*` palette.
 *
 * The shell package ships no palette by design: a host defines the semantic
 * custom properties its stylesheet reads. This client is that host, and this
 * is the one place the tokens are defined — imported from `main.tsx` before
 * anything mounts, so every surface, including the package's own chrome, sees
 * a real value.
 *
 * It has to be complete. Per CSS Custom Properties §3.2, `var(--undefined)`
 * with no fallback makes the whole declaration invalid at computed-value
 * time, so a missing token does not degrade — it drops the rule. Regenerate
 * the required set from the installed stylesheet with the package's own
 * `shell-variables` export rather than by reading this list.
 *
 * Tokens the package resolves safely on its own are left out deliberately,
 * along with the terminal colours, which nothing here mounts. Adding a token
 * no surface reads is a second place to keep numbers in sync.
 *
 * Contrast (WCAG 2.1) for the pairs that carry meaning:
 *   --shell-text on --shell-background          16.29:1
 *   --shell-text on --shell-canvas              15.13:1
 *   --shell-text-muted on --shell-background     9.47:1
 *   --shell-text-subtle on --shell-background    7.92:1
 *   --shell-accent on --shell-background         5.41:1
 *   --shell-accent-contrast on --shell-accent    5.41:1  (primary actions)
 *   --shell-accent on --shell-accent-muted       4.61:1  (selected nav text)
 */
const THEME_CSS = `
:root {
   color-scheme: dark;
  --shell-spatial-grid-dot-light: rgb(196 196 196);
  --shell-spatial-grid-dot-dark: rgb(96 96 96);
  --shell-spatial-grid-background-light: rgb(245 245 245);

  /* Window chrome and side-panel surface. Matches the host window's own
     default background colour, so the Electron paint and this value agree
     before first paint. */
  --shell-background: #16181d;

  /* Main document surface / active tab. One step lighter than
     --shell-background so the canvas reads as its own layer. */
  --shell-canvas: #1c1f26;
  --shell-spatial-canvas-background: #1c1f26;

  /* Tooltips and other floating surfaces. Lighter again. */
  --shell-raised: #262a33;

  /* Foreground scale. */
  --shell-text: #f5f5f5;
   --shell-text-muted: #b6bec9;
   --shell-text-subtle: #a5aeba;

  /* Dividers and control outlines. The strong step is part of the renderer
     contract and keeps inputs and scroll thumbs distinct from the canvas. */
  --shell-border: #343943;
  --shell-border-strong: #687386;
  --shell-input-background: #171a20;
  --shell-border-hover: var(--shell-accent);

  /* Hover overlay, and the one step stronger the package uses for pressed
     or nested hover. */
  --shell-hover: rgb(255 255 255 / 0.06);
  --shell-active: rgb(255 255 255 / 0.1);

  /* Selection, focus and resize feedback. Primary actions reuse the window
     background as their contrasting foreground instead of adding a palette. */
  --shell-accent: #5198a6;
  --shell-accent-contrast: #16181d;

  /* Selected-control background. A translucent tint of --shell-accent rather
     than a flat colour, so accent-coloured text on top of it still clears
     4.5:1 — a rounder 0.18 alpha drops it to roughly 4.2:1. */
  --shell-accent-muted: rgb(81 152 166 / 0.12);
  --shell-provider-anthropic-card-border: color-mix(in srgb, #d97757 35%, var(--shell-border));
  --shell-provider-anthropic-card-background: color-mix(in srgb, #d97757 12%, var(--shell-raised));
  --shell-provider-openai-card-border: color-mix(in srgb, #10a37f 35%, var(--shell-border));
  --shell-provider-openai-card-background: color-mix(in srgb, #10a37f 12%, var(--shell-raised));
  --shell-provider-grok-card-border: color-mix(in srgb, #f5f5f5 35%, var(--shell-border));
  --shell-provider-grok-card-background: color-mix(in srgb, #f5f5f5 12%, var(--shell-raised));
  --shell-provider-google-card-border: color-mix(in srgb, #4285f4 35%, var(--shell-border));
  --shell-provider-google-card-background: color-mix(in srgb, #4285f4 12%, var(--shell-raised));
  --shell-provider-mistral-card-border: color-mix(in srgb, #f97316 35%, var(--shell-border));
  --shell-provider-mistral-card-background: color-mix(in srgb, #f97316 12%, var(--shell-raised));
  --shell-provider-deepseek-card-border: color-mix(in srgb, #4d6bfe 35%, var(--shell-border));
  --shell-provider-deepseek-card-background: color-mix(in srgb, #4d6bfe 12%, var(--shell-raised));
  --shell-provider-meta-card-border: color-mix(in srgb, #0866ff 35%, var(--shell-border));
  --shell-provider-meta-card-background: color-mix(in srgb, #0866ff 12%, var(--shell-raised));
  --shell-provider-github-card-border: color-mix(in srgb, #8a50d8 35%, var(--shell-border));
  --shell-provider-github-card-background: color-mix(in srgb, #8a50d8 12%, var(--shell-raised));

  /* Focus indicator. Equal to --shell-accent, defined explicitly so focus
     outlines resolve on the first name rather than by falling through. */
  --shell-focus: var(--shell-accent);

  /* Shared motion for controls and transient scrollbars. */
  --shell-duration-fast: 120ms;
  --shell-ease-out: cubic-bezier(0.16, 1, 0.3, 1);

  /* The application's type. Defined here, and read by base.ts for the
     document as well as by the package's own .sb-shell rule, so the family and
     size are stated once instead of once per consumer of them.

     --shell-position is deliberately NOT defined. The package positions its
     frame with var(--shell-position, fixed), and fixed is what this
     application wants: the frame is the root element, it has no siblings to
     overlay, and being fixed is what frees it from depending on a height
     chain through html/body/#root. */
   --shell-font:
       400 0.8125rem/var(--shell-leading-base, 1.35)
      -apple-system, BlinkMacSystemFont, 'Segoe UI Variable', 'Segoe UI',
      'Helvetica Neue', system-ui, sans-serif;

  /* Status colours, centralized here so surfaces do not each hardcode them.
     The first two are the package's names, supplied as any consumer supplies
     them. The third is this application's own, under this application's
     prefix, because the package has no success colour: a name invented inside
     --shell-* is one the package may publish later meaning something else, and
     until then it reads as part of a contract it is not part of.
     eslint/shell-contract.mjs is what keeps that distinction. */
  --shell-danger: #ef4444;
  --shell-warning: #eab308;
  --maximal-success: #22c55e;

  /* Data visualizations need categorical distinctions beyond the semantic
     status palette. Feature packages consume these ordered series tokens;
     the host owns their light/dark values so charts remain coordinated with
     the surrounding application rather than inventing local colors. */
  --data-viz-series-1: #64b5c4;
  --data-viz-series-2: #77b96f;
  --data-viz-series-3: #d0a24c;
  --data-viz-series-4: #d27a8b;
  --data-viz-series-5: #789ee8;
  --data-viz-series-6: #b58ad6;
  --data-viz-series-7: #d8835f;
  --data-viz-series-8: #84919f;
  --maximal-cloud-1: #5c9fad;
  --maximal-cloud-2: #9b6ba2;
  --maximal-cloud-3: #bb7952;
  --maximal-overlay-material: rgb(32 36 44 / 0.97);
  --maximal-overlay-highlight: rgb(255 255 255 / 0.08);
  --maximal-material-scrim: rgb(8 10 14 / 0.42);

   --shell-terminal-background: #111317;
   --maximal-terminal-foreground: #f5f5f5;
   --maximal-terminal-cursor: #5198a6;
}

[data-theme='light'] {
  color-scheme: light;
  --shell-background: #ffffff;
  --shell-canvas: #eef0f4;
  --shell-spatial-canvas-background: #eef0f4;
  --shell-raised: #ffffff;
  --shell-text: #12141a;
  --shell-text-muted: #46505e;
  --shell-text-subtle: #566171;
  --shell-border: #e3e6eb;
  --shell-border-strong: #808b9a;
  --shell-input-background: #ffffff;
  --shell-hover: #eceef2;
  --shell-active: #e2e6ec;
  --shell-accent: #2563eb;
  --shell-accent-contrast: #ffffff;
  --shell-accent-muted: rgb(37 99 235 / 0.1);
  --shell-focus: var(--shell-accent);
  --shell-danger: #c0272b;
  --shell-warning: #a9691b;
  --maximal-success: #257a3e;
  --data-viz-series-1: #176b78;
  --data-viz-series-2: #397a33;
  --data-viz-series-3: #8a5d00;
  --data-viz-series-4: #9e3653;
  --data-viz-series-5: #345fba;
  --data-viz-series-6: #74449a;
  --data-viz-series-7: #a64d28;
  --data-viz-series-8: #53606e;
  --maximal-cloud-1: #4e95a3;
  --maximal-cloud-2: #a66eac;
  --maximal-cloud-3: #c9804e;
  --maximal-overlay-material: rgb(250 251 253 / 0.97);
  --maximal-overlay-highlight: rgb(255 255 255 / 0.72);
  --maximal-material-scrim: rgb(30 38 50 / 0.22);
}

:root[data-vibrancy='true'],
:root[data-background-effects='true'] {
  --bg-app: rgb(22 24 29 / 0.72);
  --bg-panel: rgb(27 30 36 / 0.82);
  --bg-canvas: rgb(16 18 22 / 0.78);
  --bg-raised: rgb(35 39 47 / 0.88);
  --shell-background: rgb(22 24 29 / 0.72);
  --shell-canvas: rgb(16 18 22 / 0.78);
  --shell-raised: rgb(35 39 47 / 0.88);
}

:root[data-theme='light'][data-vibrancy='true'],
:root[data-theme='light'][data-background-effects='true'] {
  --bg-app: rgb(255 255 255 / 0.7);
  --bg-panel: rgb(247 248 250 / 0.82);
  --bg-canvas: rgb(238 240 244 / 0.78);
  --bg-raised: rgb(255 255 255 / 0.88);
  --shell-background: rgb(255 255 255 / 0.7);
  --shell-canvas: rgb(238 240 244 / 0.78);
  --shell-raised: rgb(255 255 255 / 0.88);
}

:root[data-background-effects='true'] {
  --bg-app: rgb(22 24 29 / 0.58);
  --bg-panel: rgb(27 30 36 / 0.72);
  --bg-canvas: rgb(16 18 22 / 0.62);
  --bg-raised: rgb(35 39 47 / 0.92);
  --shell-background: rgb(22 24 29 / 0.58);
  --shell-canvas: rgb(16 18 22 / 0.62);
  --shell-raised: rgb(35 39 47 / 0.92);
}

:root[data-theme='light'][data-background-effects='true'] {
  --bg-app: rgb(255 255 255 / 0.52);
  --bg-panel: rgb(247 248 250 / 0.66);
  --bg-canvas: rgb(238 240 244 / 0.58);
  --bg-raised: rgb(255 255 255 / 0.92);
  --shell-background: rgb(255 255 255 / 0.52);
  --shell-canvas: rgb(238 240 244 / 0.58);
  --shell-raised: rgb(255 255 255 / 0.92);
}

/*
 * The status mapping, which is the host's half of the package's status
 * contract and belongs here rather than in each surface.
 *
 * StatusChip, Note, Banner and Callout all pass their state straight through
 * to data-status and read --shell-status for the colour; the package defines
 * no states, so what a state means is ours to say. Saying it once here makes
 * every one of those controls work everywhere, in the states this application
 * actually has.
 *
 * A shared mapping avoids per-class colour rules that must be repeated for
 * every new surface.
 */
.sb-shell [data-status='running'] {
  --shell-status: var(--shell-accent);
  --shell-status-muted: var(--shell-accent-muted);
}

.sb-shell [data-status='needs-approval'] {
  --shell-status: var(--shell-warning);
  --shell-status-muted: rgb(234 179 8 / 0.12);
}

.sb-shell [data-status='done'] {
  --shell-status: var(--maximal-success);
  --shell-status-muted: rgb(34 197 94 / 0.12);
}

.sb-shell [data-status='failed'],
.sb-shell [data-status='blocked'] {
  --shell-status: var(--shell-danger);
  --shell-status-muted: rgb(239 68 68 / 0.12);
}

.terminal-host {
   height: 100%;
   min-height: 0;
}
`

const THEME_STYLE_ID = 'maximal-theme'

function applyCandyPalette(style: CSSStyleDeclaration): void {
  style.setProperty(
    '--shell-candy-background',
    [
      'radial-gradient(circle at 12% 24%, rgb(255 245 224 / 28%) 0 1px, transparent 2px)',
      'radial-gradient(circle at 78% 18%, rgb(255 245 224 / 22%) 0 1.5px, transparent 2.5px)',
      'radial-gradient(circle at 62% 74%, rgb(255 245 224 / 20%) 0 1px, transparent 2px)',
      'linear-gradient(155deg, #a91f39 0%, #c8334a 54%, #7d1427 100%)',
    ].join(', '),
  )
  style.setProperty('--shell-candy-border', 'color-mix(in srgb, #f4ead4 45%, #681321)')
  style.setProperty('--shell-candy-icon-shadow', '0 4px 14px rgb(31 0 6 / 32%)')
  style.setProperty(
    '--shell-candy-shadow',
    [
      '0 1px 2px rgb(0 0 0 / 24%)',
      '0 12px 36px rgb(44 0 8 / 42%)',
      'inset 0 1px rgb(255 245 224 / 22%)',
    ].join(', '),
  )
  style.setProperty(
    '--shell-candy-sheen',
    'linear-gradient(112deg, transparent 24%, rgb(255 244 224 / 4%) 40%, rgb(255 244 224 / 22%) 49%, rgb(255 244 224 / 5%) 58%, transparent 72%)',
  )
  style.setProperty('--shell-candy-text', '#fff8e9')
}

if (typeof document !== 'undefined' && !document.getElementById(THEME_STYLE_ID)) {
  const style = document.createElement('style')
  style.id = THEME_STYLE_ID
  style.textContent = THEME_CSS
  document.head.appendChild(style)
  applyCandyPalette(document.documentElement.style)
}
