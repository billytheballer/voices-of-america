import { z } from 'zod';

/**
 * Converts a Zod schema into a JSON Schema that Claude's structured outputs
 * accept (`output_config.format`). The API constrains decoding to the schema,
 * but rejects some keywords, so this:
 *
 *  - expands enum-keyed records (Zod emits `propertyNames` + `additionalProperties`)
 *    into explicit, all-required `properties`;
 *  - sets `additionalProperties: false` on every object;
 *  - strips numeric/length/count/pattern/format constraints and restates them in
 *    the field's `description`, so the model still sees them.
 *
 * The server then validates the response with the ORIGINAL Zod schema, so the
 * stripped constraints are still enforced. One schema, two jobs.
 */

type Json = { [k: string]: unknown };

const STRIPPED = [
  'minimum',
  'maximum',
  'exclusiveMinimum',
  'exclusiveMaximum',
  'multipleOf',
  'minLength',
  'maxLength',
  'minItems',
  'maxItems',
  'pattern',
  'format',
  'propertyNames',
] as const;

function describeConstraints(s: Json): string[] {
  const notes: string[] = [];
  const isInt = s.type === 'integer';
  const unit = isInt ? 'Integer' : 'Number';
  if (s.minimum !== undefined && s.maximum !== undefined) notes.push(`${unit} from ${s.minimum} to ${s.maximum}.`);
  else if (s.minimum !== undefined) notes.push(`${unit} ≥ ${s.minimum}.`);
  else if (s.maximum !== undefined) notes.push(`${unit} ≤ ${s.maximum}.`);
  if (s.minLength !== undefined && s.maxLength !== undefined) notes.push(`${s.minLength}–${s.maxLength} characters.`);
  else if (s.maxLength !== undefined) notes.push(`At most ${s.maxLength} characters.`);
  if (s.minItems !== undefined && s.minItems === s.maxItems) notes.push(`Exactly ${s.minItems} items.`);
  else {
    if (s.minItems !== undefined && s.maxItems !== undefined) notes.push(`${s.minItems} to ${s.maxItems} items.`);
    else if (s.maxItems !== undefined) notes.push(`At most ${s.maxItems} items.`);
    else if (s.minItems !== undefined) notes.push(`At least ${s.minItems} items.`);
  }
  if (typeof s.pattern === 'string') notes.push(`Must match the regex ${s.pattern}.`);
  return notes;
}

export function toClaudeJsonSchema(node: unknown): unknown {
  if (Array.isArray(node)) return node.map(toClaudeJsonSchema);
  if (node === null || typeof node !== 'object') return node;
  const s = { ...(node as Json) };
  delete s.$schema;

  // Enum-keyed record → explicit object.
  const keys = (s.propertyNames as Json | undefined)?.enum as string[] | undefined;
  if (s.type === 'object' && keys && s.additionalProperties && typeof s.additionalProperties === 'object') {
    const value = toClaudeJsonSchema(s.additionalProperties);
    const out: Json = {
      type: 'object',
      properties: Object.fromEntries(keys.map((k) => [k, value])),
      required: keys,
      additionalProperties: false,
    };
    if (s.description) out.description = s.description;
    return out;
  }

  const notes = describeConstraints(s);
  for (const k of STRIPPED) delete s[k];

  for (const [k, v] of Object.entries(s)) {
    if (k === 'properties' && v && typeof v === 'object') {
      s.properties = Object.fromEntries(Object.entries(v as Json).map(([pk, pv]) => [pk, toClaudeJsonSchema(pv)]));
    } else if (k === 'items' || k === 'anyOf' || k === 'oneOf' || k === 'allOf' || k === 'additionalProperties') {
      s[k] = toClaudeJsonSchema(v);
    }
  }
  if (s.type === 'object') s.additionalProperties = false;
  if (notes.length) s.description = [s.description, ...notes].filter(Boolean).join(' ');
  return s;
}

/** Zod → Claude-ready JSON Schema (input side, so pre-transform types are described). */
export function claudeSchemaFor(schema: z.ZodType): Json {
  return toClaudeJsonSchema(z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' })) as Json;
}

/** Union (anyOf / type-array) count: the API caps these per request. */
export function countUnions(node: unknown): number {
  if (Array.isArray(node)) return node.reduce((n: number, x) => n + countUnions(x), 0);
  if (node === null || typeof node !== 'object') return 0;
  const s = node as Json;
  let n = Array.isArray(s.anyOf) || Array.isArray(s.type) ? 1 : 0;
  for (const v of Object.values(s)) n += countUnions(v);
  return n;
}
