// The single declaration of what the preload bridge exposes on `window`.
//
// Declared once, and here. Duplicate global declarations merge cleanly while
// they agree and fail the moment one gains a method — reporting TS2717 in the
// files that are correct rather than the one that is stale.
//
// Ambient `.d.ts` rather than a module, so it applies without every consumer
// importing it. The host's preload checks its bridge against `MaximalHost`, so
// the two cannot drift.
import type { MaximalHost } from '../../shared/host.js'

declare global {
  interface Window {
    maximal: MaximalHost
  }
}
