import { requireFreshBundles } from './global-setup.js';

/**
 * Setup for the stills runner.
 *
 * Only the freshness check. `npm run stills` builds nothing, so without this it
 * happily photographs the previous build — and an image of the wrong thing is
 * exactly the failure this repository has already made once, in the other
 * direction, by trusting a stale bundle.
 *
 * The seeding that `global-setup.ts` also does belongs to the blocking suite:
 * these captures must be identical between runs, not shuffled.
 */
export default function globalSetup(): void {
  requireFreshBundles();
}
