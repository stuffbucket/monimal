import { describe, expect, it } from 'vitest';

import {
  capabilityLabels,
  formatCompact,
  groupByKind,
  labelError,
  maskSecret,
  MASK_LIMIT,
  MAX_LABEL_LENGTH,
  type ModelCard,
} from '../src/renderer/lib/settings.js';

/**
 * The settings model.
 *
 * Everything here is a function of its arguments: no clock, no storage, and no
 * network.
 */

const model = (id: string, kind: string): ModelCard => ({
  id,
  name: id,
  kind,
  capabilities: {
    vision: false,
    toolCalls: false,
    streaming: false,
    reasoning: false,
  },
});

describe('capabilityLabels', () => {
  it('names every capability a model has', () => {
    expect(
      capabilityLabels({
        vision: true,
        imageGeneration: true,
        videoGeneration: true,
        toolCalls: true,
        streaming: true,
        reasoning: true,
      }),
    ).toEqual([
      'Vision',
      'Image generation',
      'Video generation',
      'Tools',
      'Streaming',
      'Reasoning',
    ]);
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
