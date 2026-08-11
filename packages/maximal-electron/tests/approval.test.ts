import { describe, expect, it } from 'vitest';

import {
  MAX_SUMMARY,
  describeToolCall,
  needsApproval,
  riskOf,
} from '../src/main/native/approval.js';

/**
 * The approval gate is the only thing between a local model and a shell on the
 * user's machine, so these tests are written against the failure it must not
 * have: quietly deciding that something does not need asking about.
 *
 * `approval.ts` is in the stryker mutate list. Every branch below is there to
 * kill a specific mutant, not for coverage.
 */

describe('riskOf', () => {
  it('classifies the tools that come from pi', () => {
    expect(riskOf('read')).toBe('safe');
    expect(riskOf('write')).toBe('mutating');
    expect(riskOf('edit')).toBe('mutating');
    expect(riskOf('bash')).toBe('dangerous');
  });

  // The load-bearing default. A toolset added later that forgets to declare a
  // risk lands on "ask", never on "run it".
  it('treats an unrecognised tool as dangerous', () => {
    expect(riskOf('fetch')).toBe('dangerous');
    expect(riskOf('')).toBe('dangerous');
  });

  it('lets a toolset declare its own risk', () => {
    expect(riskOf('get_app_state', 'safe')).toBe('safe');
    expect(riskOf('set_theme', 'mutating')).toBe('mutating');
  });

  it('prefers a declared risk over the built-in table', () => {
    expect(riskOf('bash', 'safe')).toBe('safe');
  });
});

describe('needsApproval', () => {
  it('never asks under "none"', () => {
    for (const risk of ['safe', 'mutating', 'dangerous'] as const) {
      expect(needsApproval('none', risk)).toBe(false);
    }
  });

  it('always asks under "all", including for safe tools', () => {
    for (const risk of ['safe', 'mutating', 'dangerous'] as const) {
      expect(needsApproval('all', risk)).toBe(true);
    }
  });

  describe('under "writes"', () => {
    it('lets a safe tool through', () => {
      expect(needsApproval('writes', 'safe')).toBe(false);
    });

    it.each(['mutating', 'dangerous'] as const)('asks before %s', (risk) => {
      expect(needsApproval('writes', risk)).toBe(true);
    });
  });

  it('asks before an unknown tool under "writes"', () => {
    // The two functions compose to the property that actually matters.
    expect(needsApproval('writes', riskOf('some_new_tool'))).toBe(true);
  });
});

describe('describeToolCall', () => {
  it('shows the command for bash, because that is what carries the risk', () => {
    expect(describeToolCall('bash', { command: 'rm -rf build', timeout: 30 })).toBe(
      'rm -rf build',
    );
  });

  it('shows the path for a file tool', () => {
    expect(describeToolCall('write', { path: '/tmp/notes.txt', content: 'hi' })).toBe(
      '/tmp/notes.txt',
    );
  });

  it('prefers the command when a call carries both', () => {
    expect(describeToolCall('bash', { command: 'cat x', path: '/etc/passwd' })).toBe(
      'cat x',
    );
  });

  it('falls back to the arguments for an unknown shape', () => {
    expect(describeToolCall('fetch', { url: 'https://example.com' })).toBe(
      '{"url":"https://example.com"}',
    );
  });

  it('does not treat a non-string command as the summary', () => {
    // A malformed call must not render `undefined` or `[object Object]` as if
    // it were the command the user is approving.
    expect(describeToolCall('bash', { command: 42 })).toBe('{"command":42}');
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'raw'],
  ])('survives %s arguments', (_label, args) => {
    expect(() => describeToolCall('bash', args)).not.toThrow();
  });

  describe('truncation', () => {
    it('leaves a summary at the limit untouched', () => {
      const exact = 'a'.repeat(MAX_SUMMARY);
      expect(describeToolCall('bash', { command: exact })).toBe(exact);
    });

    it('marks a longer summary as cut', () => {
      const long = 'a'.repeat(MAX_SUMMARY + 50);
      const result = describeToolCall('bash', { command: long });

      expect(result).toHaveLength(MAX_SUMMARY);
      expect(result.endsWith('…')).toBe(true);
    });
  });

  it('still describes a cyclic argument object', () => {
    // This runs inside the gate. A throw here would deny by accident rather
    // than by decision, and the user would never learn why. Assert the value,
    // not just that it did not throw: returning nothing is the same failure,
    // because an empty prompt reads as harmless.
    const cyclic: Record<string, unknown> = {};
    cyclic.self = cyclic;

    expect(describeToolCall('mystery', cyclic)).toBe('[object Object]');
  });
});
