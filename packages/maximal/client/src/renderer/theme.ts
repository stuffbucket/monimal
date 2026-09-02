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
 *   --shell-text-muted on --shell-background     5.14:1
 *   --shell-text-subtle on --shell-background    3.28:1  (sub-AA; quiet text only)
 *   --shell-accent on --shell-background         5.41:1
 *   --shell-accent on --shell-accent-muted       4.61:1  (selected nav text)
 */
const THEME_CSS = `
:root {
  /* Window chrome and side-panel surface. Matches the host window's own
     default background colour, so the Electron paint and this value agree
     before first paint. */
  --shell-background: #16181d;

  /* Main document surface / active tab. One step lighter than
     --shell-background so the canvas reads as its own layer. */
  --shell-canvas: #1c1f26;

  /* Tooltips and other floating surfaces. Lighter again. */
  --shell-raised: #262a33;

  /* Foreground scale. */
  --shell-text: #f5f5f5;
  --shell-text-muted: #8a8a8a;
  --shell-text-subtle: #6a6a6a;

  /* Dividers and quiet outlines. */
  --shell-border: #2a2a2a;

  /* Hover overlay, and the one step stronger the package uses for pressed
     or nested hover. */
  --shell-hover: rgb(255 255 255 / 0.06);
  --shell-active: rgb(255 255 255 / 0.1);

  /* Selection, focus and resize feedback. */
  --shell-accent: #5198a6;

  /* Selected-control background. A translucent tint of --shell-accent rather
     than a flat colour, so accent-coloured text on top of it still clears
     4.5:1 — a rounder 0.18 alpha drops it to roughly 4.2:1. */
  --shell-accent-muted: rgb(81 152 166 / 0.12);

  /* Focus indicator. Equal to --shell-accent, defined explicitly so focus
     outlines resolve on the first name rather than by falling through. */
  --shell-focus: var(--shell-accent);

  /* The application's type. Defined here, and read by base.ts for the
     document as well as by the package's own .sb-shell rule, so the family and
     size are stated once instead of once per consumer of them.

     --shell-position is deliberately NOT defined. The package positions its
     frame with var(--shell-position, fixed), and fixed is what this
     application wants: the frame is the root element, it has no siblings to
     overlay, and being fixed is what frees it from depending on a height
     chain through html/body/#root. */
  --shell-font: 400 14px/1.5 system-ui, sans-serif;

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
}
`

const THEME_STYLE_ID = 'maximal-theme'

if (typeof document !== 'undefined' && !document.getElementById(THEME_STYLE_ID)) {
  const style = document.createElement('style')
  style.id = THEME_STYLE_ID
  style.textContent = THEME_CSS
  document.head.appendChild(style)
}
