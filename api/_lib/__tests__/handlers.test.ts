import { describe, expect, it } from 'vitest';
import { INITIAL_METRICS } from '../../../src/data/initialState';
import { BillAnalysisSchema } from '../../../src/domain/schemas/billAnalysis.schema';
import { buildInitialElectorate } from '../../../src/engine/electorate/initElectorate';
import { allMoods } from '../../../src/engine/sentiment/archetypeMood';
import { heuristicParseBill } from '../../../src/services/llm/mock/heuristicBillParser';
import { templateFeed } from '../../../src/services/llm/mock/templateFeed';
import { handleGenerateFeed, handleParseBill, type ModelFn, type ServerDeps } from '../handlers';
import { createRateLimiter } from '../rateLimit';

const body = {
  text: 'Fund 3,000 new border processing officers and a seasonal farmworker visa, paid for by customs fees.',
  context: { year: 2029, quarter: 1, playerParty: 'R', metrics: INITIAL_METRICS, currentEvent: 'Border surge' },
};

/** A fake model that returns whatever `respond` builds, recording what it was sent. */
function fakeModel(respond: (n: number) => string) {
  const calls: Parameters<ModelFn>[0][] = [];
  const model: ModelFn = async (req) => {
    calls.push(req);
    return respond(calls.length);
  };
  return { model, calls };
}

const deps = (model: ModelFn | null, over: Partial<ServerDeps> = {}): ServerDeps => ({
  model,
  limiter: createRateLimiter({ capacity: 100, refillPerMinute: 100 }),
  allowedOrigins: null,
  ...over,
});
const req = (b: unknown, origin: string | null = null) => ({ body: b, ip: '1.2.3.4', origin });
const goodJson = () => JSON.stringify(heuristicParseBill(body as never));

describe('POST /api/parse-bill', () => {
  it('returns a validated analysis and sends the schema + cached system prompt to the model', async () => {
    const { model, calls } = fakeModel(goodJson);
    const out = await handleParseBill(req(body), deps(model));
    expect(out.status).toBe(200);
    expect(BillAnalysisSchema.safeParse(out.body).success).toBe(true);
    expect(calls[0]!.system.includes('nonpartisan legislative analyst')).toBe(true);
    expect(calls[0]!.turns[0]!.content.includes('<bill_text>')).toBe(true);
    expect((calls[0]!.schema as { type: string }).type).toBe('object');
  });

  it('repairs once, then fails loudly with 502', async () => {
    const once = fakeModel((n) => (n === 1 ? '{"broken": true}' : goodJson()));
    expect((await handleParseBill(req(body), deps(once.model))).status).toBe(200);
    expect(once.calls.length).toBe(2);

    const never = fakeModel(() => '{"broken": true}');
    const out = await handleParseBill(req(body), deps(never.model));
    expect(out.status).toBe(502);
    expect(out.body).toEqual(expect.objectContaining({ error: expect.objectContaining({ code: 'model_invalid_output' }) }));
  });

  it('rejects bad input before spending a model call', async () => {
    const { model, calls } = fakeModel(goodJson);
    expect((await handleParseBill(req({ text: '' }), deps(model))).status).toBe(400);
    expect((await handleParseBill(req({ ...body, text: 'x'.repeat(2_001) }), deps(model))).status).toBe(413);
    expect(calls.length).toBe(0);
  });

  it('explains a missing API key, enforces origins and rate limits', async () => {
    expect((await handleParseBill(req(body), deps(null))).status).toBe(503);
    const { model } = fakeModel(goodJson);
    expect((await handleParseBill(req(body, 'https://evil.example'), deps(model, { allowedOrigins: ['https://voa.example'] }))).status).toBe(403);
    const tight = deps(model, { limiter: createRateLimiter({ capacity: 1, refillPerMinute: 0 }) });
    expect((await handleParseBill(req(body), tight)).status).toBe(200);
    expect((await handleParseBill(req(body), tight)).status).toBe(429);
  });
});

describe('POST /api/generate-feed', () => {
  const moods = allMoods({ electorate: buildInitialElectorate(), metrics: INITIAL_METRICS, turn: 0, eventId: 'border_surge', law: null });
  const feedBody = {
    turnId: '2029-T01',
    moods,
    context: { playerName: 'Sam', playerParty: 'R', isPresident: true, year: 2029, quarter: 1, eventHeadline: 'Border surge', billTitle: null, worstMetric: null },
  };

  it('returns 20 posts and overrides any stance that contradicts the engine’s mood', async () => {
    const furious = { ...feedBody, moods: moods.map((m) => ({ ...m, mood: -80 })) };
    const { model } = fakeModel(() => {
      const feed = templateFeed(furious as never);
      return JSON.stringify({ ...feed, posts: feed.posts.map((p) => ({ ...p, stance: 'support' })) });
    });
    const out = await handleGenerateFeed(req(furious), deps(model));
    expect(out.status).toBe(200);
    const posts = (out.body as { posts: { stance: string }[] }).posts;
    expect(posts.length).toBe(20);
    expect(posts.every((p) => p.stance === 'oppose')).toBe(true);
  });

  it('rejects a feed request without exactly 20 moods', async () => {
    const { model } = fakeModel(() => '{}');
    expect((await handleGenerateFeed(req({ ...feedBody, moods: moods.slice(1) }), deps(model))).status).toBe(400);
  });
});
