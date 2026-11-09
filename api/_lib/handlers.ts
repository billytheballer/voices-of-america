import { z } from 'zod';
import { BillAnalysisSchema, type BillAnalysis } from '../../src/domain/schemas/billAnalysis.schema';
import { ArchetypeMoodInputSchema, makeFeedBatchSchema, reconcileStance, type FeedBatch } from '../../src/domain/schemas/feedBatch.schema';
import { MetricIdSchema, PartySchema } from '../../src/domain/schemas/shared';
import { METRIC_IDS } from '../../src/domain/constants';
import { ARCHETYPE_IDS } from '../../src/data/archetypes';
import { claudeSchemaFor } from '../../src/services/llm/claudeSchema';
import { generateStructured, type ChatTurn } from '../../src/services/llm/structured';
import { BILL_PARSER_SYSTEM, billParserUserMessage } from '../../src/services/llm/prompts/billParser.prompt';
import { VOTER_FEED_SYSTEM, voterFeedUserMessage } from '../../src/services/llm/prompts/voterFeed.prompt';
import { LLMError, MAX_BILL_CHARS, type FeedRequest, type LLMErrorCode, type ParseBillRequest } from '../../src/services/llm/types';
import type { RateLimiter } from './rateLimit';

/**
 * Framework-free request handlers. The Vercel routes and the Vite dev
 * middleware are thin adapters over these; tests call them directly with a
 * fake model. Every request is validated in, every response validated out.
 */

export interface ModelRequest {
  system: string;
  turns: ChatTurn[];
  /** Claude-ready JSON Schema for structured outputs. */
  schema: Record<string, unknown>;
  maxTokens: number;
}
export type ModelFn = (req: ModelRequest) => Promise<string>;

export interface ServerDeps {
  /** null when no API key is configured. */
  model: ModelFn | null;
  limiter: RateLimiter;
  /** Exact origins allowed to call the API; null = allow any (dev). */
  allowedOrigins: string[] | null;
}

export interface Incoming {
  body: unknown;
  ip: string;
  origin: string | null;
}

export interface Outgoing {
  status: number;
  body: unknown;
}

const err = (status: number, code: LLMErrorCode, message: string): Outgoing => ({
  status,
  body: { error: { code, message } },
});

// ---- Request schemas (what the browser may send) ----
const MetricsSchema = z.object(Object.fromEntries(METRIC_IDS.map((m) => [m, z.number().finite()])) as Record<(typeof METRIC_IDS)[number], z.ZodNumber>);

export const ParseBillRequestSchema = z.object({
  text: z.string().trim().min(1),
  context: z.object({
    year: z.number().int().min(2028).max(2200),
    quarter: z.number().int().min(1).max(4),
    playerParty: PartySchema,
    metrics: MetricsSchema,
    currentEvent: z.string().max(300),
  }),
});

export const FeedRequestSchema = z.object({
  turnId: z.string().regex(/^\d{4}-T\d{2}$/),
  moods: z.array(ArchetypeMoodInputSchema).length(ARCHETYPE_IDS.length),
  context: z.object({
    playerName: z.string().min(1).max(80),
    playerParty: PartySchema,
    isPresident: z.boolean(),
    year: z.number().int(),
    quarter: z.number().int().min(1).max(4),
    eventHeadline: z.string().max(300),
    billTitle: z.string().max(120).nullable(),
    worstMetric: MetricIdSchema.nullable(),
  }),
});

const FEED_SCHEMA = makeFeedBatchSchema(ARCHETYPE_IDS);
const BILL_JSON_SCHEMA = claudeSchemaFor(BillAnalysisSchema);
const FEED_JSON_SCHEMA = claudeSchemaFor(FEED_SCHEMA);

function guard(req: Incoming, deps: ServerDeps): Outgoing | null {
  if (deps.allowedOrigins && (!req.origin || !deps.allowedOrigins.includes(req.origin))) {
    return err(403, 'forbidden', 'This API only serves the Voices of America app.');
  }
  if (!deps.model) {
    return err(503, 'not_configured', 'The server has no ANTHROPIC_API_KEY. Set one, or run the game with VITE_LLM_MODE=mock.');
  }
  if (!deps.limiter.take(req.ip)) {
    return err(429, 'rate_limited', 'Too many requests. Wait a minute and try again.');
  }
  return null;
}

async function runModel<T>(
  deps: ServerDeps,
  system: string,
  schema: z.ZodType<T>,
  jsonSchema: Record<string, unknown>,
  userMessage: string,
  maxTokens: number,
): Promise<Outgoing> {
  try {
    const result = await generateStructured(
      (turns) => deps.model!({ system, turns, schema: jsonSchema, maxTokens }),
      schema,
      userMessage,
    );
    if (!result.ok) {
      return err(502, 'model_invalid_output', `The model returned an invalid response twice (${result.issues[0] ?? 'unknown issue'}).`);
    }
    return { status: 200, body: result.data };
  } catch (e) {
    if (e instanceof LLMError) return err(e.status ?? 502, e.code, e.message);
    return err(502, 'upstream_error', 'The language model could not be reached.');
  }
}

export async function handleParseBill(req: Incoming, deps: ServerDeps): Promise<Outgoing> {
  const parsed = ParseBillRequestSchema.safeParse(req.body);
  if (!parsed.success) return err(400, 'invalid_request', 'Request did not match the expected shape.');
  if (parsed.data.text.length > MAX_BILL_CHARS) {
    return err(413, 'too_long', `Bills are limited to ${MAX_BILL_CHARS.toLocaleString('en-US')} characters.`);
  }
  const blocked = guard(req, deps);
  if (blocked) return blocked;
  return runModel<BillAnalysis>(
    deps,
    BILL_PARSER_SYSTEM,
    BillAnalysisSchema,
    BILL_JSON_SCHEMA,
    billParserUserMessage(parsed.data as ParseBillRequest),
    2_000,
  );
}

export async function handleGenerateFeed(req: Incoming, deps: ServerDeps): Promise<Outgoing> {
  const parsed = FeedRequestSchema.safeParse(req.body);
  if (!parsed.success) return err(400, 'invalid_request', 'Request did not match the expected shape.');
  const blocked = guard(req, deps);
  if (blocked) return blocked;
  const request = parsed.data as FeedRequest;
  const out = await runModel<FeedBatch>(deps, VOTER_FEED_SYSTEM, FEED_SCHEMA, FEED_JSON_SCHEMA, voterFeedUserMessage(request), 6_000);
  if (out.status !== 200) return out;

  // The engine's mood wins: correct any stance that contradicts it.
  const moodOf = new Map(request.moods.map((m) => [m.archetype_id, m.mood]));
  const feed = out.body as FeedBatch;
  return {
    status: 200,
    body: {
      ...feed,
      posts: feed.posts.map((p) => ({ ...p, stance: reconcileStance(p.stance, moodOf.get(p.archetype_id) ?? 0) })),
    },
  };
}

export const SCHEMAS_FOR_INSPECTION = { BILL_JSON_SCHEMA, FEED_JSON_SCHEMA };
