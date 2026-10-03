import { describe, expect, it } from 'vitest';

import { MODEL_RUNNER_OPERATIONS } from '../src/index.js';

describe('model runner contract', () => {
  it('keeps provider-facing operation shapes explicit', () => {
    expect(MODEL_RUNNER_OPERATIONS).toEqual([
      'generate',
      'score-token-candidates',
      'classify-labels',
    ]);
  });
});
