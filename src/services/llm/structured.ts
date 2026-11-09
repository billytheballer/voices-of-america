import type { z } from 'zod';

/**
 * Model-agnostic "generate, validate, repair once" loop.
 *
 * Structured outputs already guarantee the JSON *shape*, but our Zod schemas
 * enforce more (ranges, exact counts, uniqueness, cross-field rules). When the
 * model's JSON fails those, we send the exact Zod issues back and ask for a
 * corrected object, once. A second failure is a hard error: we never guess.
 */

export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Calls the model with a conversation; resolves to the raw text it returned. */
export type ModelCall = (turns: ChatTurn[]) => Promise<string>;

export type StructuredResult<T> =
  | { ok: true; data: T; attempts: number }
  | { ok: false; attempts: number; issues: string[]; raw: string };

export function formatIssues(error: z.ZodError): string[] {
  return error.issues.slice(0, 12).map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`);
}

export async function generateStructured<S extends z.ZodType>(
  call: ModelCall,
  schema: S,
  userMessage: string,
  maxRepairs = 1,
): Promise<StructuredResult<z.output<S>>> {
  const turns: ChatTurn[] = [{ role: 'user', content: userMessage }];
  let raw = '';
  let issues: string[] = [];

  for (let attempt = 1; attempt <= maxRepairs + 1; attempt++) {
    raw = await call(turns);
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      issues = ['(root): response was not valid JSON'];
    }
    if (json !== undefined) {
      const parsed = schema.safeParse(json);
      if (parsed.success) return { ok: true, data: parsed.data, attempts: attempt };
      issues = formatIssues(parsed.error);
    }
    turns.push(
      { role: 'assistant', content: raw },
      {
        role: 'user',
        content:
          'That JSON failed validation:\n' +
          issues.map((i) => `- ${i}`).join('\n') +
          '\nReturn the complete corrected JSON object only, changing nothing else.',
      },
    );
  }
  return { ok: false, attempts: maxRepairs + 1, issues, raw };
}
