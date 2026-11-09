import { METRIC_IDS } from '@/domain/constants';
import type { CoalitionId, MetricId } from '@/domain/types';
import type { BillAnalysis } from '@/domain/schemas/billAnalysis.schema';
import type { FeedPost } from '@/domain/schemas/feedBatch.schema';
import { ARCHETYPES } from '@/data/archetypes';
import { FACTIONS } from '@/data/factions';
import type { BillOutcome } from '@/engine/legislature/passage';
import type { GameState } from '@/engine/loop/types';
import { currentEvent } from '@/engine/loop/actions';
import { feedTurnId } from '@/engine/loop/calendar';
import { allMoods, metricStress, type MoodContext } from '@/engine/sentiment/archetypeMood';
import type { FeedRequest } from '@/services/llm/types';

/**
 * Pure helpers behind the Voices of America panel: building the request from
 * game state, engine-computed engagement numbers, reply threading, and the tally.
 */

export interface ActedBill {
  bill: BillAnalysis;
  outcome: BillOutcome['status'];
}

const ENACTED = new Set<BillOutcome['status']>(['enacted', 'executive_order_upheld']);
const OUTCOME_NOTE: Record<BillOutcome['status'], string> = {
  enacted: 'signed into law',
  failed_house: 'failed in the House',
  failed_senate: 'failed in the Senate',
  executive_order_upheld: 'signed as an executive order',
  executive_order_struck_down: 'struck down in court',
};

export const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);

/** One feed per (turn, bill acted on). Same key → same request → served from cache. */
export const feedKey = (game: GameState, acted: ActedBill | null) =>
  `${feedTurnId(game.year, game.quarter)}:${acted ? `${slug(acted.bill.title)}:${acted.outcome}` : 'news'}`;

export function worstMetric(game: GameState): MetricId | null {
  let best: MetricId | null = null;
  let worst = 0.05;
  for (const m of METRIC_IDS) {
    const s = metricStress(m, game.metrics, game.turn);
    if (s > worst) [best, worst] = [m, s];
  }
  return best;
}

export function buildFeedRequest(game: GameState, acted: ActedBill | null): FeedRequest {
  const law: MoodContext['law'] =
    acted && ENACTED.has(acted.outcome)
      ? { id: slug(acted.bill.title), title: acted.bill.title, policy_vector: acted.bill.policy_vector }
      : null;
  return {
    turnId: feedTurnId(game.year, game.quarter),
    moods: allMoods({ electorate: game.electorate, metrics: game.metrics, turn: game.turn, eventId: game.currentEventId, law }),
    context: {
      playerName: game.player.name,
      playerParty: game.player.party,
      isPresident: game.player.isPresident,
      year: game.year,
      quarter: game.quarter,
      eventHeadline: currentEvent(game).headline,
      billTitle: acted ? `${acted.bill.title} (${OUTCOME_NOTE[acted.outcome]})` : null,
      worstMetric: worstMetric(game),
    },
  };
}

function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/**
 * Likes and reposts are engine numbers, not model output: louder posts from
 * bigger factions travel further, with stable per-post jitter.
 */
export function engagement(post: FeedPost, turnId: string): { likes: number; reposts: number } {
  const a = ARCHETYPES.find((x) => x.id === post.archetype_id)!;
  const reach = FACTIONS[a.faction].nationalWeight * 40_000;
  const jitter = 0.6 + (hash(`${turnId}:${post.archetype_id}`) % 1000) / 1000; // 0.6–1.6
  const likes = Math.round(reach * (post.intensity / 5) ** 1.5 * jitter);
  return { likes, reposts: Math.round(likes * (0.08 + post.intensity * 0.03)) };
}

export const compactNumber = (n: number) =>
  n >= 10_000 ? `${Math.round(n / 1000)}K` : n >= 1000 ? `${(n / 1000).toFixed(1).replace(/\.0$/, '')}K` : String(n);

/**
 * Orders posts as threads: each top-level post, then its replies. Replies to
 * missing posts (or reply chains) are shown as top-level so nothing is lost.
 */
export function threadPosts(posts: FeedPost[]): { post: FeedPost; depth: 0 | 1 }[] {
  const ids = new Set(posts.map((p) => p.archetype_id));
  const isReply = (p: FeedPost) => p.reply_to_archetype_id !== null && ids.has(p.reply_to_archetype_id);
  const out: { post: FeedPost; depth: 0 | 1 }[] = [];
  const placed = new Set<string>();
  for (const p of posts) {
    if (isReply(p)) continue;
    out.push({ post: p, depth: 0 });
    placed.add(p.archetype_id);
    for (const r of posts) {
      if (r.reply_to_archetype_id === p.archetype_id && !placed.has(r.archetype_id)) {
        out.push({ post: r, depth: 1 });
        placed.add(r.archetype_id);
      }
    }
  }
  for (const p of posts) if (!placed.has(p.archetype_id)) out.push({ post: p, depth: 0 });
  return out;
}

export function tally(posts: FeedPost[]) {
  return {
    support: posts.filter((p) => p.stance === 'support').length,
    oppose: posts.filter((p) => p.stance === 'oppose').length,
    mixed: posts.filter((p) => p.stance === 'mixed' || p.stance === 'indifferent').length,
  };
}

export const coalitionOfPost = (p: FeedPost): CoalitionId =>
  FACTIONS[ARCHETYPES.find((a) => a.id === p.archetype_id)!.faction].coalition;
