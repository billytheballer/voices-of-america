import { handleGenerateFeed } from './_lib/handlers';
import { depsFromEnv, serveWebRequest } from './_lib/server';

/** POST /api/generate-feed → FeedBatch (20 posts). Vercel Function (web-standard signature). */
const deps = depsFromEnv(process.env);

export async function POST(request: Request): Promise<Response> {
  return serveWebRequest(request, handleGenerateFeed, deps);
}
