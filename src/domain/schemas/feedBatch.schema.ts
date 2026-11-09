import { z } from 'zod';
import { FEED_SIZE } from '../constants';
import { shortText, strictInt } from './shared';

/**
 * Contract for the voter-feed LLM call.
 *
 * The engine computes each archetype's mood (-100..100) and top concerns from
 * faction satisfaction + metric deltas BEFORE calling the LLM. The LLM only
 * writes the voice. That keeps posts consistent with the numbers.
 */

export const POST_STANCES = ['support', 'oppose', 'mixed', 'indifferent'] as const;
export const POST_TONES = [
  'angry',
  'hopeful',
  'sarcastic',
  'anxious',
  'proud',
  'weary',
  'celebratory',
] as const;
export const REACTION_TARGETS = ['bill', 'event', 'metric', 'campaign'] as const;

/** What the engine sends to the LLM per archetype. */
export const ArchetypeMoodInputSchema = z.object({
  archetype_id: z.string(),
  mood: strictInt(-100, 100),
  top_concerns: z.array(z.string()).max(3),
  triggering_items: z.array(
    z.object({ type: z.enum(REACTION_TARGETS), id: z.string(), headline: z.string() }),
  ),
});
export type ArchetypeMoodInput = z.infer<typeof ArchetypeMoodInputSchema>;

/**
 * Archetype IDs live in data/archetypes.ts (Stage 3), so the schema is built
 * by a factory that closes over the valid ID list.
 */
export function makeFeedBatchSchema(archetypeIds: readonly [string, ...string[]]) {
  const ArchetypeIdSchema = z.enum(archetypeIds);

  const PostSchema = z.object({
    archetype_id: ArchetypeIdSchema,
    handle: z.string().regex(/^@\w{2,20}$/),
    text: shortText(280),
    reacting_to: z.enum(REACTION_TARGETS),
    reference_id: z.string().nullable(),
    stance: z.enum(POST_STANCES),
    intensity: strictInt(1, 5),
    tone: z.enum(POST_TONES),
    hashtags: z.array(z.string().regex(/^#\w{1,30}$/)).max(3),
    reply_to_archetype_id: ArchetypeIdSchema.nullable(),
  });

  return z
    .object({
      schema_version: z.literal('1.0'),
      turn_id: z.string().regex(/^\d{4}-T\d{2}$/),
      posts: z.array(PostSchema).length(FEED_SIZE),
    })
    .superRefine((batch, ctx) => {
      const ids = batch.posts.map((p) => p.archetype_id);
      if (new Set(ids).size !== ids.length) {
        ctx.addIssue({ code: 'custom', message: 'Each archetype must post exactly once', path: ['posts'] });
      }
      batch.posts.forEach((p, i) => {
        if (p.reply_to_archetype_id === p.archetype_id) {
          ctx.addIssue({ code: 'custom', message: 'Archetype cannot reply to itself', path: ['posts', i] });
        }
      });
    });
}

export type FeedBatch = z.infer<ReturnType<typeof makeFeedBatchSchema>>;
export type FeedPost = FeedBatch['posts'][number];

/**
 * Deterministic guard: if the LLM's stance contradicts the engine's mood,
 * the engine wins. Returns the corrected stance (or the original if consistent).
 */
export function reconcileStance(
  stance: (typeof POST_STANCES)[number],
  mood: number,
): (typeof POST_STANCES)[number] {
  if (mood <= -40 && stance === 'support') return 'oppose';
  if (mood >= 40 && stance === 'oppose') return 'support';
  return stance;
}
