/**
 * Seeded shuffling for the end-to-end suite.
 *
 * Playwright runs tests in declaration order and has no shuffle option, so
 * this registers them in a randomised order instead.
 *
 * Why bother: a suite that only passes in declaration order is hiding shared
 * state. These specs share one Electron application, which makes that easy to
 * do by accident. It already happened once here, when a screenshot test
 * depended on a tab an earlier test had left open.
 *
 * The seed is printed on every run, and `E2E_SEED` reproduces one exactly.
 * A shuffled suite without a reproducible seed just trades one flake for
 * another.
 */

/** Small, fast, seedable generator. Good enough to order a test list. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * The seed for this run.
 *
 * `e2e/global-setup.ts` sets `E2E_SEED` once, before any worker starts, so
 * every load of a spec file agrees on the order. The fallback here only
 * matters if the setup did not run; it is fixed rather than random, because a
 * seed that differs between collection and execution is worse than no
 * shuffling at all.
 */
export function resolveSeed(): number {
  const fromEnv = process.env['E2E_SEED'];
  if (fromEnv && Number.isFinite(Number(fromEnv))) return Number(fromEnv);
  return 1;
}

/** Fisher-Yates, driven by the seeded generator. Does not mutate the input. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const random = mulberry32(seed);
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j] as T, out[i] as T];
  }
  return out;
}

export interface Scenario {
  name: string;
  run: () => Promise<void>;
}

/**
 * Collect scenarios, then register them in a shuffled order.
 *
 * Usage: build the list with `scenario()`, then call `registerShuffled(test)`
 * once at the bottom of the spec.
 */
export function createRegistry() {
  const scenarios: Scenario[] = [];

  return {
    scenario(name: string, run: () => Promise<void>): void {
      scenarios.push({ name, run });
    },

    /**
     * Register every collected scenario, shuffled.
     *
     * **Known cost:** Playwright reports the source line of the `test()` call,
     * and every test now shares one call site. So the reporter shows the same
     * line for all of them. Test names stay unique, and `--grep` still works.
     *
     * Set `E2E_SHUFFLE=0` to register in declaration order while debugging.
     */
    registerShuffled(register: (name: string, run: () => Promise<void>) => void): number {
      const seed = resolveSeed();
      const enabled = process.env['E2E_SHUFFLE'] !== '0';
      const order = enabled ? shuffle(scenarios, seed) : scenarios;
      for (const item of order) register(item.name, item.run);
      return seed;
    },
  };
}
