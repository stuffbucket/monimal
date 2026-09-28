import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const renderer = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src/renderer');

describe('the renderer', () => {
  it('names third-party custom properties only in the emulator adapter', () => {
    // A host defines `--shell-*`. Anything else is an emulator's own property,
    // and belongs in the one module that maps the host's onto it.
    const named = readdirSync(renderer)
      .filter((file) => /\.tsx?$/.test(file))
      .flatMap((file) =>
        [...readFileSync(path.join(renderer, file), 'utf8').matchAll(/'(--[a-z][a-z0-9-]*)'/g)]
          .map((match) => `${file}: ${match[1] ?? ''}`),
      );

    expect(named.length).toBeGreaterThan(0);
    expect([...new Set(named.filter((entry) => !entry.includes(': --shell-')))].sort()).toEqual([
      'emulator.ts: --term-bg',
      'emulator.ts: --term-cursor',
      'emulator.ts: --term-fg',
    ]);
  });
});
