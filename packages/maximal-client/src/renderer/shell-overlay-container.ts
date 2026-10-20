import type { RefObject } from 'react'

const LEGACY_SHELL_ROOT = '.sb-shell.app'

/**
 * The legacy shell root, read when an overlay opens, so a design-system
 * overlay opened from a legacy surface keeps the shell's scoped styles on its
 * contents. It resolves to null in the design-system renderer, where overlays
 * portal to the document body.
 */
export const shellOverlayContainer: RefObject<HTMLElement | null> = {
  get current() {
    return typeof document === 'undefined'
      ? null
      : document.querySelector<HTMLElement>(LEGACY_SHELL_ROOT)
  },
}
