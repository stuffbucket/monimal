import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { MAIN_RENDERER_CACHE } from '../vite.cache-paths.mjs';

describe('renderer Vite caches', () => {
  it('uses the main renderer identity', () => {
    expect(path.basename(MAIN_RENDERER_CACHE)).toBe('main_window');
  });
});