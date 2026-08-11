/**
 * Convert a tool's JSON Schema into the subset llama.cpp can build a grammar
 * from.
 *
 * The two engines want different dialects of the same idea. pi validates tool
 * arguments with TypeBox, which expresses a closed set of strings as
 * `anyOf: [{const: 'a'}, {const: 'b'}]`. llama.cpp builds a GBNF grammar and
 * understands `enum: ['a', 'b']`. Handed the first, it throws `Unknown
 * immutable type undefined` and the tool never becomes callable.
 *
 * That failure is quiet in the worst way: the model simply never calls the
 * tool, which looks like a model too small to follow instructions rather than
 * a schema this code failed to translate.
 *
 * Deliberately conservative. Anything this cannot express returns `undefined`,
 * and the caller drops that tool from the embedded run rather than passing a
 * schema that is subtly wrong. A dropped tool is visible. A misdescribed one
 * produces arguments that pass the grammar and fail the real validator.
 *
 * Pure, and free of `electron`, so it is in the stryker mutate list.
 */

/** The shape llama.cpp accepts. Loose on purpose: it is a foreign dialect. */
export type GrammarSchema = Record<string, unknown>;

interface SchemaNode {
  type?: unknown;
  properties?: unknown;
  required?: unknown;
  items?: unknown;
  anyOf?: unknown;
  oneOf?: unknown;
  enum?: unknown;
  const?: unknown;
  description?: unknown;
}

/** Types llama.cpp's grammar builder handles directly. */
const SCALARS = new Set(['string', 'number', 'integer', 'boolean', 'null']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Pull the constant values out of an `anyOf` or `oneOf` of `const` members.
 *
 * Returns undefined when even one member is something else, because a partial
 * conversion would silently narrow what the tool accepts.
 */
function constUnion(members: unknown): unknown[] | undefined {
  if (!Array.isArray(members) || members.length === 0) return undefined;

  const values: unknown[] = [];
  for (const member of members) {
    if (!isRecord(member)) return undefined;
    if (!('const' in member)) return undefined;
    values.push(member.const);
  }
  return values;
}

function convertNode(node: unknown): GrammarSchema | undefined {
  if (!isRecord(node)) return undefined;
  const schema = node as SchemaNode;

  const described = (out: GrammarSchema): GrammarSchema => {
    if (typeof schema.description === 'string') out.description = schema.description;
    return out;
  };

  // A closed set of values, however it was spelled.
  if (Array.isArray(schema.enum)) return described({ enum: [...schema.enum] });
  if ('const' in schema) return described({ enum: [schema.const] });

  const union = constUnion(schema.anyOf) ?? constUnion(schema.oneOf);
  if (union) return described({ enum: union });

  if (schema.type === 'object') {
    const properties = isRecord(schema.properties) ? schema.properties : {};
    const converted: Record<string, GrammarSchema> = {};

    for (const [key, value] of Object.entries(properties)) {
      const child = convertNode(value);
      // One unconvertible property makes the whole object unconvertible. The
      // model would otherwise be free to invent that field's shape.
      if (!child) return undefined;
      converted[key] = child;
    }

    const out: GrammarSchema = { type: 'object', properties: converted };
    if (Array.isArray(schema.required)) {
      const required = schema.required.filter(
        (name): name is string => typeof name === 'string' && name in converted,
      );
      if (required.length > 0) out.required = required;
    }
    return described(out);
  }

  if (schema.type === 'array') {
    const items = convertNode(schema.items);
    if (!items) return undefined;
    return described({ type: 'array', items });
  }

  // Stryker disable next-line ConditionalExpression: the typeof narrows for the
  // compiler and cannot change behaviour. SCALARS holds only strings, so
  // `has` on a non-string is false either way. Removing it fails to compile.
  if (typeof schema.type === 'string' && SCALARS.has(schema.type)) {
    return described({ type: schema.type });
  }

  // An untyped node accepts anything, which a grammar cannot express.
  return undefined;
}

/**
 * Convert a tool's parameters, or return undefined if it cannot be expressed.
 *
 * A tool with no parameters is `{type: 'object', properties: {}}` rather than
 * undefined: it is callable, it just takes nothing.
 */
export function toGrammarSchema(parameters: unknown): GrammarSchema | undefined {
  // A tool that takes nothing. Only a genuinely empty schema qualifies: an
  // earlier version treated "no `type` key" as empty, which quietly turned an
  // unconvertible union into a tool that accepts no arguments at all.
  if (parameters === undefined) return { type: 'object', properties: {} };
  if (isRecord(parameters) && Object.keys(parameters).length === 0) {
    return { type: 'object', properties: {} };
  }

  return convertNode(parameters);
}
