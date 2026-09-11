import { describe, expect, it } from 'vitest';
import type { UserConfig } from 'vite';

import { normalizePreloadOutput } from '../vite.preload.config.mjs';

describe('preload Vite config', () => {
  it('replaces Forge deprecated preload chunking option', () => {
    const output = { inlineDynamicImports: true };
    const config: UserConfig = { build: { rollupOptions: { output } } };

    normalizePreloadOutput(config);

    expect(output).toEqual({ codeSplitting: false });
  });
});