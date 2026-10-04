import { DEFAULT_APPEARANCE } from './appearance'
import { PALETTE_STYLE_ID, applyPalette } from './color/palette'

/*
 * The `--maximal-color-*` palette and the `--shell-*` component tokens.
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
 * Colour values are not written here. `./color/palette.ts` calculates the
 * atomic ramps and the semantic colours that alias them; this file holds the
 * aliases that are the same in every theme and mode.
 */
const THEME_CSS = `
:root {
   color-scheme: dark;
  --shell-spatial-grid-dot-light: rgb(196 196 196);
  --shell-spatial-grid-dot-dark: rgb(96 96 96);
  --shell-spatial-grid-background-light: rgb(245 245 245);

  /* Colour tokens follow
     --maximal-color-{type}-{element}-{role}-{prominence}-{interaction}:
     type bg, text, icon or border; element toolbar, menu or tooltip, omitted
     for a global colour; roles brand, selected, disabled, component,
     assistive, danger, measure, warning, success, info, inverse and on{role};
     prominence secondary, tertiary or strong; interaction hover or
     pressed. A slot left at default is omitted, and a name with nothing after
     its type and element ends in default.

     Atomic colours are --maximal-color-{ramp}-{step}, steps 100 to 1000 by
     lightness in both modes; ./color/palette.ts defines them and the base
     semantic colours. bg-default is the window chrome and side panels,
     bg-secondary is the canvas (documents, terminals, the spatial canvas),
     and bg-tertiary is floating surfaces. Role colours are calculated per
     theme in ./color/palette.ts. */

  /* The strong step keeps inputs and scroll thumbs distinct from the canvas. */
  --maximal-color-border-strong-hover: var(--maximal-color-bg-brand);

  /* Terminals and the spatial canvas sit on the canvas. */
  --shell-spatial-canvas-background: var(--maximal-color-bg-secondary);
  --shell-terminal-background: var(--maximal-color-bg-secondary);

  --shell-provider-anthropic-card-border: color-mix(in srgb, #d97757 35%, var(--maximal-color-border-default));
  --shell-provider-anthropic-card-background: color-mix(in srgb, #d97757 12%, var(--maximal-color-bg-tertiary));
  --shell-provider-openai-card-border: color-mix(in srgb, #10a37f 35%, var(--maximal-color-border-default));
  --shell-provider-openai-card-background: color-mix(in srgb, #10a37f 12%, var(--maximal-color-bg-tertiary));
  --shell-provider-grok-card-border: color-mix(in srgb, #f5f5f5 35%, var(--maximal-color-border-default));
  --shell-provider-grok-card-background: color-mix(in srgb, #f5f5f5 12%, var(--maximal-color-bg-tertiary));
  --shell-provider-google-card-border: color-mix(in srgb, #4285f4 35%, var(--maximal-color-border-default));
  --shell-provider-google-card-background: color-mix(in srgb, #4285f4 12%, var(--maximal-color-bg-tertiary));
  --shell-provider-mistral-card-border: color-mix(in srgb, #f97316 35%, var(--maximal-color-border-default));
  --shell-provider-mistral-card-background: color-mix(in srgb, #f97316 12%, var(--maximal-color-bg-tertiary));
  --shell-provider-deepseek-card-border: color-mix(in srgb, #4d6bfe 35%, var(--maximal-color-border-default));
  --shell-provider-deepseek-card-background: color-mix(in srgb, #4d6bfe 12%, var(--maximal-color-bg-tertiary));
  --shell-provider-meta-card-border: color-mix(in srgb, #0866ff 35%, var(--maximal-color-border-default));
  --shell-provider-meta-card-background: color-mix(in srgb, #0866ff 12%, var(--maximal-color-bg-tertiary));
  --shell-provider-github-card-border: color-mix(in srgb, #8a50d8 35%, var(--maximal-color-border-default));
  --shell-provider-github-card-background: color-mix(in srgb, #8a50d8 12%, var(--maximal-color-bg-tertiary));

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

  --maximal-cloud-1: #5c9fad;
  --maximal-cloud-2: #9b6ba2;
  --maximal-cloud-3: #bb7952;
  --maximal-overlay-material: rgb(32 36 44 / 0.97);
  --maximal-overlay-highlight: rgb(255 255 255 / 0.08);
  --maximal-material-scrim: rgb(8 10 14 / 0.42);

   --maximal-terminal-foreground: #f5f5f5;
   --maximal-terminal-cursor: #5198a6;
}

[data-theme='light'] {
  color-scheme: light;
  --maximal-cloud-1: #4e95a3;
  --maximal-cloud-2: #a66eac;
  --maximal-cloud-3: #c9804e;
  --maximal-overlay-material: rgb(250 251 253 / 0.97);
  --maximal-overlay-highlight: rgb(255 255 255 / 0.72);
  --maximal-material-scrim: rgb(30 38 50 / 0.22);
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
  --shell-status: var(--maximal-color-text-brand);
  --shell-status-muted: var(--maximal-color-bg-selected);
}

.sb-shell [data-status='needs-approval'] {
  --shell-status: var(--maximal-color-text-warning);
  --shell-status-muted: var(--maximal-color-bg-warning-secondary);
}

.sb-shell [data-status='done'] {
  --shell-status: var(--maximal-color-text-success);
  --shell-status-muted: var(--maximal-color-bg-success-secondary);
}

.sb-shell [data-status='failed'],
.sb-shell [data-status='blocked'] {
  --shell-status: var(--maximal-color-text-danger);
  --shell-status-muted: var(--maximal-color-bg-danger-secondary);
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
  if (document.getElementById(PALETTE_STYLE_ID) === null) applyPalette(DEFAULT_APPEARANCE.colors)
}
