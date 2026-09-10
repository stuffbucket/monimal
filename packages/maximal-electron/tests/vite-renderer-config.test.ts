import path from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  DEMO_RENDERER_CACHE,
  MAIN_RENDERER_CACHE,
  TERMINAL_LAB_RENDERER_CACHE,
} from '../vite.cache-paths.js';

describe('renderer Vite caches', () => {
  it('isolates concurrently running renderer optimizers', () => {
    expect(MAIN_RENDERER_CACHE).not.toBe(DEMO_RENDERER_CACHE);
    expect(MAIN_RENDERER_CACHE).not.toBe(TERMINAL_LAB_RENDERER_CACHE);
    expect(DEMO_RENDERER_CACHE).not.toBe(TERMINAL_LAB_RENDERER_CACHE);
    expect(path.basename(MAIN_RENDERER_CACHE)).toBe('main_window');
    expect(path.basename(DEMO_RENDERER_CACHE)).toBe('demo_window');
    expect(path.basename(TERMINAL_LAB_RENDERER_CACHE)).toBe('terminal_lab_window');
  });
});