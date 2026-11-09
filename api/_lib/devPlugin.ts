import type { Plugin } from 'vite';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleGenerateFeed, handleParseBill, type Incoming, type Outgoing, type ServerDeps } from './handlers';
import { depsFromEnv } from './server';

/**
 * Serves /api/* inside `vite dev` with the same handlers Vercel runs, so the
 * real LLM path works locally without extra tooling. The key stays in Node,
 * never in the browser bundle.
 */
export function llmDevApi(env: Record<string, string | undefined>): Plugin {
  const routes: Record<string, (req: Incoming, deps: ServerDeps) => Promise<Outgoing>> = {
    '/api/parse-bill': handleParseBill,
    '/api/generate-feed': handleGenerateFeed,
  };
  let deps: ServerDeps | null = null;

  return {
    name: 'voa-llm-dev-api',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const handler = req.url ? routes[req.url.split('?')[0]!] : undefined;
        if (!handler) return next();
        deps ??= depsFromEnv(env);
        const send = (status: number, body: unknown) => {
          res.statusCode = status;
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(body));
        };
        if (req.method !== 'POST') return send(405, { error: { code: 'invalid_request', message: 'Use POST.' } });
        const chunks: Buffer[] = [];
        for await (const c of req) chunks.push(c as Buffer);
        let body: unknown;
        try {
          body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
        } catch {
          return send(400, { error: { code: 'invalid_request', message: 'Body must be JSON.' } });
        }
        const out = await handler({ body, ip: req.socket.remoteAddress ?? 'dev', origin: null }, deps);
        send(out.status, out.body);
      });
    },
  };
}
