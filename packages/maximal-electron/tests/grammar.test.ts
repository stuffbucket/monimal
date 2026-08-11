import { describe, expect, it } from 'vitest';

import { toGrammarSchema } from '../src/main/native/grammar.js';

/**
 * These exist because the bug they describe was invisible.
 *
 * Handed a TypeBox literal union, llama.cpp threw `Unknown immutable type
 * undefined` and the tool never became callable. The overlay showed an empty
 * answer and no tool call, which reads exactly like a model too small to
 * follow an instruction. It cost a round of blaming the model.
 *
 * `grammar.ts` is in the stryker mutate list.
 */

describe('toGrammarSchema', () => {
  it('rewrites a TypeBox literal union as an enum', () => {
    // Exactly what TypeBox emits for Union([Literal('system'), ...]).
    const converted = toGrammarSchema({
      type: 'object',
      properties: {
        theme: { anyOf: [{ const: 'system' }, { const: 'light' }, { const: 'dark' }] },
      },
      required: ['theme'],
    });

    expect(converted).toEqual({
      type: 'object',
      properties: { theme: { enum: ['system', 'light', 'dark'] } },
      required: ['theme'],
    });
  });

  it('handles oneOf the same way as anyOf', () => {
    expect(toGrammarSchema({ oneOf: [{ const: 'a' }, { const: 'b' }] })).toEqual({
      enum: ['a', 'b'],
    });
  });

  it('passes an existing enum through', () => {
    expect(toGrammarSchema({ enum: ['a', 'b'] })).toEqual({ enum: ['a', 'b'] });
  });

  it('treats a lone const as a single-value enum', () => {
    expect(toGrammarSchema({ const: 'only' })).toEqual({ enum: ['only'] });
  });

  it('keeps scalars and their descriptions', () => {
    expect(
      toGrammarSchema({
        type: 'object',
        properties: { command: { type: 'string', description: 'Shell command' } },
        required: ['command'],
      }),
    ).toEqual({
      type: 'object',
      properties: { command: { type: 'string', description: 'Shell command' } },
      required: ['command'],
    });
  });

  it.each(['string', 'number', 'integer', 'boolean', 'null'])(
    'keeps a %s property',
    (type) => {
      expect(toGrammarSchema({ type })).toEqual({ type });
    },
  );

  it('drops a description that is not a string', () => {
    // A schema generator can emit odd values here, and llama.cpp would choke
    // on a non-string where it expects prose.
    expect(toGrammarSchema({ type: 'string', description: 42 })).toEqual({
      type: 'string',
    });
  });

  it('refuses a union whose members are not all schema objects', () => {
    expect(toGrammarSchema({ anyOf: [{ const: 'a' }, 'raw'] })).toBeUndefined();
    expect(toGrammarSchema({ anyOf: [{ const: 'a' }, null] })).toBeUndefined();
  });

  it('ignores a required entry that is not a string', () => {
    expect(
      toGrammarSchema({
        type: 'object',
        properties: { a: { type: 'string' } },
        required: ['a', 7],
      }),
    ).toEqual({
      type: 'object',
      properties: { a: { type: 'string' } },
      required: ['a'],
    });
  });

  it('ignores a number that names a property once coerced', () => {
    // `in` coerces its key, so `0 in { '0': ... }` is true. A number therefore
    // reaches the output unless the type is checked as well as the membership.
    // A grammar name must be a string, so this is dropped.
    expect(
      toGrammarSchema({
        type: 'object',
        properties: { '0': { type: 'string' } },
        required: [0],
      }),
    ).toEqual({
      type: 'object',
      properties: { '0': { type: 'string' } },
    });
  });

  it('recurses into arrays', () => {
    expect(
      toGrammarSchema({
        type: 'object',
        properties: {
          edits: {
            type: 'array',
            items: {
              type: 'object',
              properties: { find: { type: 'string' } },
              required: ['find'],
            },
          },
        },
      }),
    ).toEqual({
      type: 'object',
      properties: {
        edits: {
          type: 'array',
          items: {
            type: 'object',
            properties: { find: { type: 'string' } },
            required: ['find'],
          },
        },
      },
    });
  });

  it('describes a tool that takes nothing', () => {
    expect(toGrammarSchema({ type: 'object', properties: {} })).toEqual({
      type: 'object',
      properties: {},
    });
  });

  it('drops a required name that has no property', () => {
    // A grammar cannot demand a field it does not describe.
    expect(
      toGrammarSchema({
        type: 'object',
        properties: { a: { type: 'string' } },
        required: ['a', 'ghost'],
      }),
    ).toEqual({
      type: 'object',
      properties: { a: { type: 'string' } },
      required: ['a'],
    });
  });

  it('omits required entirely when nothing survives', () => {
    expect(
      toGrammarSchema({ type: 'object', properties: {}, required: ['ghost'] }),
    ).toEqual({ type: 'object', properties: {} });
  });

  describe('refusing what it cannot express', () => {
    // The point of the module. A partial conversion would let the model send
    // arguments that satisfy the grammar and fail the real validator.
    it('refuses a union that is not all constants', () => {
      expect(
        toGrammarSchema({ anyOf: [{ const: 'a' }, { type: 'string' }] }),
      ).toBeUndefined();
    });

    it('refuses an empty union', () => {
      expect(toGrammarSchema({ anyOf: [] })).toBeUndefined();
    });

    it('refuses an object with one unconvertible property', () => {
      expect(
        toGrammarSchema({
          type: 'object',
          properties: {
            fine: { type: 'string' },
            bad: { anyOf: [{ type: 'string' }, { type: 'number' }] },
          },
        }),
      ).toBeUndefined();
    });

    it('refuses an array of something unconvertible', () => {
      expect(
        toGrammarSchema({ type: 'array', items: { not: 'a schema' } }),
      ).toBeUndefined();
    });

    it('refuses an unknown type', () => {
      expect(toGrammarSchema({ type: 'tuple' })).toBeUndefined();
    });
  });

  it('treats an absent or untyped schema as taking nothing', () => {
    expect(toGrammarSchema(undefined)).toEqual({ type: 'object', properties: {} });
    expect(toGrammarSchema({})).toEqual({ type: 'object', properties: {} });
  });

  it('refuses a non-object schema', () => {
    expect(toGrammarSchema('nonsense')).toBeUndefined();
    expect(toGrammarSchema(null)).toBeUndefined();
  });
});
