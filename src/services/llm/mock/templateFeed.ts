import { ARCHETYPES } from '../../../data/archetypes';
import type { FeedBatch, FeedPost } from '../../../domain/schemas/feedBatch.schema';
import { reconcileStance } from '../../../domain/schemas/feedBatch.schema';
import type { FeedRequest } from '../types';

/**
 * Offline stand-in for the voter feed: deterministic templates driven by the
 * engine's moods. Plainer than the real model, but it respects every mood and
 * contract rule, so the feed works with no API key.
 */

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
const pick = <T,>(xs: readonly T[], seed: number): T => xs[seed % xs.length]!;

const OPENERS = {
  angry: ['Unbelievable.', 'I am done being polite about this.', 'Read this twice to be sure.'],
  anxious: ['Not sleeping great lately.', 'Trying to stay calm, but', 'Doing the math at the kitchen table again.'],
  weary: ['Same story, different quarter.', 'Here we go again.', 'Not surprised, just tired.'],
  hopeful: ['Cautiously optimistic here.', 'Okay, this could actually help.', 'First decent news in a while.'],
  proud: ['Credit where it is due.', 'This is what showing up looks like.', 'Told my neighbors this would happen.'],
  celebratory: ['Finally!', 'Now THAT is a good day.', 'Calling my sister about this one.'],
  sarcastic: ['Oh good, another plan.', 'Sure, that will fix it.', 'Great timing, as always.'],
} as const;

type Tone = keyof typeof OPENERS;

function toneFor(mood: number, seed: number): Tone {
  if (mood <= -60) return pick(['angry', 'angry', 'sarcastic'] as const, seed);
  if (mood <= -25) return pick(['anxious', 'weary', 'sarcastic'] as const, seed);
  // Near-neutral people are wary, never upbeat: an upbeat opener on a crisis reads wrong.
  if (mood < 25) return pick(['weary', 'anxious', 'weary'] as const, seed);
  if (mood < 60) return pick(['hopeful', 'proud'] as const, seed);
  return pick(['celebratory', 'proud'] as const, seed);
}

export function templateFeed(req: FeedRequest): FeedBatch {
  const posts: FeedPost[] = req.moods.map((mood) => {
    const a = ARCHETYPES.find((x) => x.id === mood.archetype_id)!;
    const seed = hash(`${req.turnId}:${a.id}`);
    const tone = toneFor(mood.mood, seed);
    const trigger = mood.triggering_items[0];
    const concern = mood.top_concerns[0] ?? 'the cost of living';
    const stance = reconcileStance(mood.mood <= -20 ? 'oppose' : mood.mood >= 20 ? 'support' : 'mixed', mood.mood);
    const about = trigger ? `"${trigger.headline}."` : `Everyone in ${a.city} is talking about ${concern}.`;
    const verdict =
      stance === 'support'
        ? `As a ${a.occupation.toLowerCase()} in ${a.city}, this is the kind of thing I hoped for.`
        : stance === 'oppose'
          ? `As a ${a.occupation.toLowerCase()} in ${a.city}, I feel it first in ${concern}.`
          : `Still watching what it means for ${concern} here in ${a.city}.`;
    const text = `${pick(OPENERS[tone], seed >>> 3)} ${about} ${verdict}`.slice(0, 280);
    return {
      archetype_id: a.id,
      handle: a.handle,
      text,
      reacting_to: trigger?.type ?? 'event',
      reference_id: trigger?.id ?? null,
      stance,
      intensity: Math.min(5, Math.max(1, Math.round(Math.abs(mood.mood) / 20) + 1)),
      tone,
      hashtags: [],
      reply_to_archetype_id: null,
    };
  });
  addReplies(posts, req);
  return { schema_version: '1.0', turn_id: req.turnId, posts };
}

/**
 * Up to two deterministic replies: someone who strongly disagrees answers the
 * loudest voice on the other side. Shows threading without an API key.
 */
function addReplies(posts: FeedPost[], req: FeedRequest) {
  const moodOf = new Map(req.moods.map((m) => [m.archetype_id, m.mood]));
  const loud = [...posts].sort((a, b) => Math.abs(moodOf.get(b.archetype_id)!) - Math.abs(moodOf.get(a.archetype_id)!));
  let replies = 0;
  const used = new Set<string>();
  for (const target of loud) {
    if (replies === 2 || Math.abs(moodOf.get(target.archetype_id)!) < 30) break;
    const sign = Math.sign(moodOf.get(target.archetype_id)!);
    const replier = loud.find(
      (p) => !used.has(p.archetype_id) && p.archetype_id !== target.archetype_id && Math.sign(moodOf.get(p.archetype_id)!) === -sign && Math.abs(moodOf.get(p.archetype_id)!) >= 20,
    );
    if (!replier) continue;
    const a = ARCHETYPES.find((x) => x.id === replier.archetype_id)!;
    const t = ARCHETYPES.find((x) => x.id === target.archetype_id)!;
    replier.reply_to_archetype_id = target.archetype_id;
    replier.text = `${t.handle} I hear you, but from ${a.city} it looks different. ${replier.text}`.slice(0, 280);
    used.add(replier.archetype_id).add(target.archetype_id);
    replies++;
  }
}
