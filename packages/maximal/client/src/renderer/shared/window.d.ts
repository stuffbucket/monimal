// The single declaration of what the preload bridge exposes on `window`.
//
// Declared once, and here. Duplicate global declarations merge cleanly while
// they agree and fail the moment one gains a method — reporting TS2717 in the
// files that are correct rather than the one that is stale.
//
// Ambient `.d.ts` rather than a module, so it applies without every consumer
// importing it. Deriving the type from the preload means it cannot drift from
// what is actually exposed.
import type { MaximalBridge } from '../../preload/index.js'

declare global {
  interface Window {
    maximal: MaximalBridge
  }
}
