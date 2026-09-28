import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.{ts,tsx}'],
    environment: 'node',

    /**
     * Run files and tests in a random order.
     *
     * A suite that only passes in declaration order is hiding shared state.
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