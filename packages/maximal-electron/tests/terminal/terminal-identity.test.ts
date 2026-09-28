import { describe, expect, it } from 'vitest';

import {
  TERMINAL_PROGRAM,
  TERMINAL_SESSION_PREFIX,
} from '../../src/main/terminal-identity.js';

describe('terminal identity', () => {
  it('uses Maximal for terminal capabilities and generated tmux sessions', () => {
    expect(TERMINAL_PROGRAM).toBe('Maximal');
    expect(TERMINAL_SESSION_PREFIX).toBe('maximal');
  });
});
