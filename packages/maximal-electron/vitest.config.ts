import { defineConfig } from 'vitest/config';

// Unit tests only.
//
// `e2e/` is excluded because those specs are Playwright, not Vitest. Without
// this, Vitest collects them, finds no Vitest tests inside, and fails.
export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    exclude: ['node_modules', 'out', '.vite', 'e2e'],
    environment: 'node',

    /**
     * Run files and tests in a random order.
     *
     * A suite that only passes in declaration order is hiding shared state.
     * This repository already produced one such bug, in the end-to-end suite,
     * where a screenshot test depended on a tab an earlier test had left open.
     *
     * The seed is printed on failure, and `VITEST_SEED` reproduces a run
     * exactly. Without that, a shuffled suite trades one flake for another.
     */
    sequence: {
      shuffle: { files: true, tests: true },
      ...(process.env['VITEST_SEED']
        ? { seed: Number(process.env['VITEST_SEED']) }
        : {}),
    },
  },
});
