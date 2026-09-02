import { SHELL_CONTENT } from '../src/renderer/lib/content.js';
import { describe, expect, it } from 'vitest';

import {
  capabilityLabels,
  diagnosticsBundle,
  formatCompact,
  formatCost,
  groupByKind,
  labelError,
  maskSecret,
  MASK_LIMIT,
  MAX_LABEL_LENGTH,
  NO_VALUE,
  relativeTime,
  share,
  USAGE_PERIODS,
  type ModelCard,
} from '../src/renderer/lib/settings.js';

/**
 * The settings model.
 *
 * Everything here is a function of its arguments: no clock, no storage, no
 * network. `relativeTime` takes `now` for exactly that reason, so these tests
 * pin a boundary rather than sleeping past one.
 */

const model = (id: string, kind: string): ModelCard => ({
  id,
  name: id,
  kind,
  capabilities: { vision: false, toolCalls: false, streaming: false, reasoning: false },
});

describe('capabilityLabels', () => {
  it('names every capability a model has', () => {
    expect(
      capabilityLabels({
        vision: true,
        toolCalls: true,
        streaming: true,
        reasoning: true,
      }),
    ).toEqual(['Vision', 'Tools', 'Streaming', 'Reasoning']);
  });

  it('names only the ones it has', () => {
    expect(
      capabilityLabels({
        vision: false,
        toolCalls: true,
        streaming: false,
        reasoning: true,
      }),
    ).toEqual(['Tools', 'Reasoning']);
  });

  it('says nothing about a model that does nothing', () => {
    // An absent capability is not shown as absent. A card with no chips shows
    // an em dash instead, which is the caller's decision and not this one's.
    expect(
      capabilityLabels({
        vision: false,
        toolCalls: false,
        streaming: false,
        reasoning: false,
      }),
    ).toEqual([]);
  });
});

describe('groupByKind', () => {
  it('keeps the order the provider sent', () => {
    // Re-sorting would hide a deliberate order. `embeddings` came second here,
    // so it stays second.
    const groups = groupByKind([
      model('a', 'chat'),
      model('b', 'embeddings'),
      model('c', 'chat'),
    ]);

    expect(groups.map((group) => group.kind)).toEqual(['chat', 'embeddings']);
    expect(groups[0]?.models.map((entry) => entry.id)).toEqual(['a', 'c']);
    expect(groups[1]?.models.map((entry) => entry.id)).toEqual(['b']);
  });

  it('groups an empty catalogue into nothing', () => {
    expect(groupByKind([])).toEqual([]);
  });
});

describe('maskSecret', () => {
  it('shows one bullet per character of a short value', () => {
    expect(maskSecret('abcde')).toBe('•••••');
  });

  it('stops at the limit, so a long key does not state its own length', () => {
    expect(maskSecret('x'.repeat(200))).toHaveLength(MASK_LIMIT);
  });

  it('masks nothing when there is nothing', () => {
    expect(maskSecret('')).toBe('');
  });
});

describe('labelError', () => {
  it('accepts a name', () => {
    expect(labelError('Claude Code')).toBeUndefined();
  });

  it('refuses an empty name', () => {
    expect(labelError('')).toBe('Give this connection a name.');
  });

  it('refuses a name that is only space', () => {
    expect(labelError('   ')).toBe('Give this connection a name.');
  });

  it('accepts a name exactly at the limit', () => {
    // The boundary is the part that gets written wrong: 64 characters is
    // acceptable, and 65 is not.
    expect(labelError('a'.repeat(MAX_LABEL_LENGTH))).toBeUndefined();
  });

  it('refuses a name past the limit', () => {
    expect(labelError('a'.repeat(MAX_LABEL_LENGTH + 1))).toBe(
      'Keep this under 64 characters.',
    );
  });
});

describe('diagnosticsBundle', () => {
  it('writes indented JSON, grouped as the report is', () => {
    const text = diagnosticsBundle([
      {
        id: 'runtime',
        label: 'Runtime',
        entries: [
          { label: 'Electron', value: '43.2.0' },
          { label: 'Packaged', value: 'false' },
        ],
      },
      { id: 'link', label: 'Connection', entries: [{ label: 'Provider', value: 'local' }] },
    ]);

    expect(text).toBe(
      [
        '{',
        '  "Runtime": {',
        '    "Electron": "43.2.0",',
        '    "Packaged": "false"',
        '  },',
        '  "Connection": {',
        '    "Provider": "local"',
        '  }',
        '}',
      ].join('\n'),
    );
  });

  it('writes an empty object for an empty report', () => {
    expect(diagnosticsBundle([])).toBe('{}');
  });
});

describe('formatCompact', () => {
  it('leaves a small number alone', () => {
    expect(formatCompact(0)).toBe('0');
    expect(formatCompact(999)).toBe('999');
  });

  it('switches to thousands at a thousand', () => {
    expect(formatCompact(1000)).toBe('1.0K');
    expect(formatCompact(1234)).toBe('1.2K');
  });

  it('drops the decimal at ten', () => {
    // One decimal below ten and none above. `999.4K` does not read.
    expect(formatCompact(10_000)).toBe('10K');
    expect(formatCompact(12_345)).toBe('12K');
  });

  it('switches to millions at a million', () => {
    expect(formatCompact(1_000_000)).toBe('1.0M');
    expect(formatCompact(3_450_000)).toBe('3.5M');
  });
});

describe('formatCost', () => {
  it('states a cost in billing units', () => {
    expect(formatCost(512_000_000)).toBe('0.512 AIU');
    expect(formatCost(2_000_000_000)).toBe('2.000 AIU');
  });

  it('states nothing for a period that cost nothing', () => {
    // An em dash rather than `0.000`, because a zero reads as a measurement
    // somebody took. The literal rather than `NO_VALUE`, because asserting
    // against the constant passes for an empty string too, and an empty cell
    // reads as missing rather than as a stated nothing.
    expect(formatCost(0)).toBe('—');
    expect(formatCost(-1)).toBe('—');
    expect(NO_VALUE).toBe('—');
  });
});

describe('share', () => {
  it('is the percentage of the total', () => {
    expect(share(25, 100)).toBe(25);
    expect(share(1, 4)).toBe(25);
  });

  it('is nothing when there is no total to divide by', () => {
    expect(share(0, 0)).toBe(0);
    expect(share(5, -1)).toBe(0);
  });
});

describe('relativeTime', () => {
  const now = 1_700_000_000_000;

  it('calls the last few seconds "just now"', () => {
    expect(relativeTime(now, now)).toBe('just now');
    expect(relativeTime(now - 2_999, now)).toBe('just now');
  });

  it('counts seconds from three', () => {
    expect(relativeTime(now - 3_000, now)).toBe('3s ago');
    expect(relativeTime(now - 59_000, now)).toBe('59s ago');
  });

  it('counts minutes from a minute', () => {
    expect(relativeTime(now - 60_000, now)).toBe('1m ago');
    expect(relativeTime(now - 59 * 60_000, now)).toBe('59m ago');
  });

  it('counts hours from an hour', () => {
    expect(relativeTime(now - 3_600_000, now)).toBe('1h ago');
    expect(relativeTime(now - 23 * 3_600_000, now)).toBe('23h ago');
  });

  it('counts days from a day', () => {
    expect(relativeTime(now - 86_400_000, now)).toBe('1d ago');
    expect(relativeTime(now - 9 * 86_400_000, now)).toBe('9d ago');
  });

  it('reads a timestamp in the future as "just now"', () => {
    // Clocks disagree. A negative age would render as "-4s ago".
    expect(relativeTime(now + 4_000, now)).toBe('just now');
  });
});

describe('the label tables', () => {
  /*
   * These used to be here, as `APP_STATUS_LABELS` and a `USAGE_PERIODS` that
   * carried `label` and `noun`. They are content, so they moved to
   * `lib/content.ts`; what stays in this module is the order the periods are
   * offered in, which is arithmetic's business rather than copy's.
   */
  it('offers every period, in order', () => {
    expect(USAGE_PERIODS).toEqual(['day', 'week', 'month', 'all']);
  });

  it('names each of them, and each application status, in the catalogue', () => {
    expect(SHELL_CONTENT.usage.periods).toEqual({
      day: { label: 'Today', noun: 'today' },
      week: { label: '7 days', noun: 'the last 7 days' },
      month: { label: 'This month', noun: 'this month' },
      all: { label: 'All time', noun: 'all time' },
    });

    expect(SHELL_CONTENT.apps.statuses).toEqual({
      ready: 'Ready',
      'not-installed': 'Not installed',
      'coming-soon': 'Coming soon',
    });
  });

  it('has a word for every period the type allows', () => {
    // A period added to the union with no entry here renders an empty button.
    expect(Object.keys(SHELL_CONTENT.usage.periods).sort()).toEqual([...USAGE_PERIODS].sort());
  });
});
