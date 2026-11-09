import { handleParseBill } from './_lib/handlers';
import { depsFromEnv, serveWebRequest } from './_lib/server';

/** POST /api/parse-bill → BillAnalysis. Vercel Function (web-standard signature). */
const deps = depsFromEnv(process.env);

export async function POST(request: Request): Promise<Response> {
  return serveWebRequest(request, handleParseBill, deps);
}
