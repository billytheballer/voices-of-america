import { describe, expect, it } from 'vitest';
import { makeFeedBatchSchema, type FeedPost } from '@/domain/schemas/feedBatch.schema';
import { ARCHETYPE_IDS } from '@/data/archetypes';
import { newGame } from '@/engine/loop/newGame';
import { shockFaction } from '@/engine/electorate/applyModifiers';
import { STATE_CODES } from '@/domain/constants';
import { makeBill, NO_AXES } from '@/engine/__tests__/fixtures';
import { templateFeed } from '@/services/llm/mock/templateFeed';
import { FeedRequestSchema } from '../../../api/_lib/handlers';
import { buildFeedRequest, compactNumber, engagement, feedKey, tally, threadPosts } from '../voter-feed/feedModel';

const game = newGame({ seed: 5, playerName: 'Rivera', party: 'D' });
const borderLaw = makeBill({ title: 'Border Act', policy_vector: { ...NO_AXES, immigration: 8 } });

describe('feed request', () => {
  it('is a valid server request with 20 engine-computed moods', () => {
    expect(FeedRequestSchema.safeParse(buildFeedRequest(game, null)).success).toBe(true);
  });

  it('an enacted law becomes a trigger; a failed one is only context', () => {
    const passed = buildFeedRequest(game, { bill: borderLaw, outcome: 'enacted' });
    expect(passed.moods.some((m) => m.triggering_items.some((t) => t.type === 'bill'))).toBe(true);
    expect(passed.context.billTitle).toBe('Border Act (signed into law)');
    const failed = buildFeedRequest(game, { bill: borderLaw, outcome: 'failed_senate' });
    expect(failed.moods.some((m) => m.triggering_items.some((t) => t.type === 'bill'))).toBe(false);
    expect(failed.context.billTitle).toBe('Border Act (failed in the Senate)');
  });

  it('keys one feed per quarter plus one per bill outcome', () => {
    expect(feedKey(game, null)).toBe('2028-T01:news');
    expect(feedKey(game, { bill: borderLaw, outcome: 'enacted' })).toBe('2028-T01:border-act:enacted');
  });
});

describe('offline feed with replies', () => {
  const polarized = { ...game, electorate: shockFaction(shockFaction(game.electorate, 'd_progressive', STATE_CODES, 40), 'r_america_first', STATE_CODES, -40) };
  const feed = templateFeed(buildFeedRequest(polarized, null));

  it('stays valid and threads up to two cross-side replies', () => {
    expect(makeFeedBatchSchema(ARCHETYPE_IDS).safeParse(feed).success).toBe(true);
    const replies = feed.posts.filter((p) => p.reply_to_archetype_id);
    expect(replies.length).toBeGreaterThan(0);
    expect(replies.length).toBeLessThanOrEqual(2);
  });

  it('never leaks placeholder text across many seeds and turns', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const g = newGame({ seed, playerName: 'Rivera', party: seed % 2 ? 'D' : 'R' });
      for (const p of templateFeed(buildFeedRequest(g, null)).posts) {
        expect(/undefined|null|NaN|\[object/.test(p.text)).toBe(false);
      }
    }
  });

  it('undecided voices never sound upbeat', () => {
    const feed = templateFeed(buildFeedRequest(game, null));
    for (const p of feed.posts.filter((x) => x.stance === 'mixed')) {
      expect(['hopeful', 'proud', 'celebratory'].includes(p.tone)).toBe(false);
    }
  });

  it('threads replies directly under their parent', () => {
    const t = threadPosts(feed.posts);
    expect(t.length).toBe(20);
    t.forEach((row, i) => {
      if (row.depth === 1) {
        const parentIdx = t.findIndex((x) => x.post.archetype_id === row.post.reply_to_archetype_id);
        expect(parentIdx).toBeLessThan(i);
      }
    });
  });
});

describe('engagement and tally', () => {
  const post = (id: string, intensity: number, stance: FeedPost['stance'] = 'support', reply: string | null = null): FeedPost => ({
    archetype_id: id, handle: '@x1', text: 'x', reacting_to: 'event', reference_id: null, stance, intensity, tone: 'weary', hashtags: [], reply_to_archetype_id: reply,
  });

  it('is deterministic and grows with intensity', () => {
    const quiet = engagement(post('az_suburban_mom_42', 1), '2029-T01');
    const loud = engagement(post('az_suburban_mom_42', 5), '2029-T01');
    expect(loud.likes).toBeGreaterThan(quiet.likes);
    expect(engagement(post('az_suburban_mom_42', 5), '2029-T01')).toEqual(loud);
  });

  it('orphan replies still show up', () => {
    const t = threadPosts([post('a', 3, 'support', 'missing'), post('b', 3)]);
    expect(t.map((x) => x.post.archetype_id)).toEqual(['a', 'b']);
  });

  it('counts stances and formats numbers', () => {
    expect(tally([post('a', 1), post('b', 1, 'oppose'), post('c', 1, 'mixed')])).toEqual({ support: 1, oppose: 1, mixed: 1 });
    expect(compactNumber(950)).toBe('950');
    expect(compactNumber(1234)).toBe('1.2K');
    expect(compactNumber(25_400)).toBe('25K');
  });
});
