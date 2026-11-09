import { createAnthropicModel } from './anthropic';
import { createRateLimiter } from './rateLimit';
import type { ServerDeps, Incoming, Outgoing } from './handlers';

/** Builds server dependencies from environment variables (Vercel or Vite dev). */
export function depsFromEnv(env: Record<string, string | undefined>): ServerDeps {
  const key = env.ANTHROPIC_API_KEY?.trim();
  return {
    model: key ? createAnthropicModel(key, env.ANTHROPIC_MODEL?.trim() || 'claude-sonnet-5-5') : null,
    // 20 requests per client, refilling 6 a minute.
    limiter: createRateLimiter({ capacity: 20, refillPerMinute: 6 }),
    allowedOrigins: env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(',').map((s) => s.trim()) : null,
  };
}

/** Adapts a web-standard Request to our framework-free handlers. */
export async function serveWebRequest(
  request: Request,
  handler: (req: Incoming, deps: ServerDeps) => Promise<Outgoing>,
  deps: ServerDeps,
): Promise<Response> {
  if (request.method !== 'POST') {
    return Response.json({ error: { code: 'invalid_request', message: 'Use POST.' } }, { status: 405 });
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: { code: 'invalid_request', message: 'Body must be JSON.' } }, { status: 400 });
  }
  const ip = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'unknown';
  const out = await handler({ body, ip, origin: request.headers.get('origin') }, deps);
  return Response.json(out.body, { status: out.status, headers: { 'cache-control': 'no-store' } });
}
