import { z } from 'zod';
import { BillAnalysisSchema } from '../../domain/schemas/billAnalysis.schema';
import { makeFeedBatchSchema } from '../../domain/schemas/feedBatch.schema';
import { ARCHETYPE_IDS } from '../../data/archetypes';
import { heuristicParseBill } from './mock/heuristicBillParser';
import { templateFeed } from './mock/templateFeed';
import { LLMError, MAX_BILL_CHARS, type LLMErrorCode, type LLMProvider } from './types';

const FEED_SCHEMA = makeFeedBatchSchema(ARCHETYPE_IDS);

/** Deterministic, offline, free. Default for local dev, CI and the public demo. */
export function createMockProvider({ latencyMs = 350 }: { latencyMs?: number } = {}): LLMProvider {
  const wait = (signal?: AbortSignal) =>
    new Promise<void>((resolve, reject) => {
      const t = setTimeout(resolve, latencyMs);
      signal?.addEventListener('abort', () => {
        clearTimeout(t);
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  return {
    name: 'mock',
    async parseBill(req, signal) {
      if (req.text.length > MAX_BILL_CHARS) throw new LLMError('too_long', `Bills are limited to ${MAX_BILL_CHARS} characters.`);
      await wait(signal);
      return BillAnalysisSchema.parse(heuristicParseBill(req));
    },
    async generateFeed(req, signal) {
      await wait(signal);
      return FEED_SCHEMA.parse(templateFeed(req));
    },
  };
}

const ErrorBody = z.object({ error: z.object({ code: z.string(), message: z.string() }) });

/**
 * Calls our own serverless proxy (never Anthropic directly: the API key lives
 * only on the server). Responses are validated AGAIN in the browser, as
 * defense in depth against a misconfigured or tampered proxy.
 */
export function createProxyProvider({ baseUrl = '', timeoutMs = 60_000, fetchImpl = fetch } = {}): LLMProvider {
  async function post<T>(path: string, body: unknown, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
    const timeout = AbortSignal.timeout(timeoutMs);
    const combined = signal ? AbortSignal.any([signal, timeout]) : timeout;
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: combined,
      });
    } catch (e) {
      if (signal?.aborted) throw e;
      throw new LLMError('network_error', timeout.aborted ? 'The request timed out.' : 'Could not reach the game server.');
    }
    const json: unknown = await res.json().catch(() => null);
    if (!res.ok) {
      const parsed = ErrorBody.safeParse(json);
      throw new LLMError(
        (parsed.success ? parsed.data.error.code : 'upstream_error') as LLMErrorCode,
        parsed.success ? parsed.data.error.message : `Server error (${res.status}).`,
        res.status,
      );
    }
    const parsed = schema.safeParse(json);
    if (!parsed.success) throw new LLMError('model_invalid_output', 'The server returned data the game could not use.');
    return parsed.data;
  }

  return {
    name: 'proxy',
    parseBill: (req, signal) => post('/api/parse-bill', req, BillAnalysisSchema, signal),
    generateFeed: (req, signal) => post('/api/generate-feed', req, FEED_SCHEMA, signal),
  };
}

/**
 * Memoizes identical requests (FNV-1a over the JSON). Re-submitting the same
 * draft, or re-rendering the same turn's feed, costs nothing. Small LRU.
 */
export function withCache(provider: LLMProvider, max = 50): LLMProvider {
  const cache = new Map<string, Promise<unknown>>();
  const key = (kind: string, req: unknown) => {
    const s = `${provider.name}:${kind}:${JSON.stringify(req)}`;
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
    return `${kind}:${h >>> 0}:${s.length}`;
  };
  function memo<T>(k: string, run: () => Promise<T>): Promise<T> {
    const hit = cache.get(k);
    if (hit) {
      cache.delete(k);
      cache.set(k, hit); // refresh LRU position
      return hit as Promise<T>;
    }
    const p = run();
    cache.set(k, p);
    p.catch(() => cache.delete(k)); // never cache failures
    if (cache.size > max) cache.delete(cache.keys().next().value!);
    return p;
  }
  return {
    name: provider.name,
    parseBill: (req, signal) => memo(key('bill', req), () => provider.parseBill(req, signal)),
    generateFeed: (req, signal) => memo(key('feed', req), () => provider.generateFeed(req, signal)),
  };
}
