import { useState } from 'react';
import { COALITION_IDS, COALITION_LABELS } from '@/domain/constants';
import type { CoalitionId } from '@/domain/types';
import type { FeedPost } from '@/domain/schemas/feedBatch.schema';
import { ARCHETYPES } from '@/data/archetypes';
import { FACTIONS } from '@/data/factions';
import type { GameState } from '@/engine/loop/types';
import { useVoterFeed, type FeedEntry } from '@/hooks/useVoterFeed';
import { useGameStore } from '@/store/gameStore';
import { analysisErrorText } from '@/features/bill-drafting/copy';
import { coalitionOfPost, compactNumber, engagement, tally, threadPosts, type ActedBill } from './feedModel';

const STANCE_WORD = { support: 'Approves', oppose: 'Disapproves', mixed: 'Torn', indifferent: 'Shrugs' } as const;

/**
 * The 20 Voices of America. The engine decides each person's mood; the model
 * (or the offline templates) writes the words; the engine sets the reach.
 */
export function FeedPanel({ game }: { game: GameState }) {
  const lastBill = useGameStore((s) => s.lastBill);
  const acted: ActedBill | null = lastBill && lastBill.turn === game.turn ? { bill: lastBill.bill, outcome: lastBill.outcome.status } : null;
  const { entries, retry } = useVoterFeed(game, acted);
  const [filter, setFilter] = useState<CoalitionId | 'all'>('all');

  return (
    <section aria-labelledby="feed-h">
      <h2 id="feed-h" className="font-semibold">Voices of America</h2>
      <p className="mt-1 text-sm text-ink-2">Twenty Americans react to the news and to you, every quarter.</p>

      <div role="radiogroup" aria-label="Show voices from" className="mt-3 flex flex-wrap gap-1.5 text-xs">
        {(['all', ...COALITION_IDS] as const).map((c) => (
          <button
            key={c}
            type="button"
            role="radio"
            aria-checked={filter === c}
            onClick={() => setFilter(c)}
            className={`rounded-full border px-2.5 py-1 ${filter === c ? 'border-ink bg-ink text-white' : 'border-rule text-ink-2 hover:border-ink/40'}`}
          >
            {c === 'all' ? 'Everyone' : COALITION_LABELS[c].replace(' Coalition', '')}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-8">
        {entries.length === 0 && <p className="text-sm text-ink-2">Listening to the country…</p>}
        {entries.map((entry, i) =>
          i === 0 ? (
            <LatestBatch key={entry.key} entry={entry} filter={filter} retry={retry} />
          ) : (
            <details key={entry.key} className="group">
              <summary className="cursor-pointer list-none border-b border-rule pb-2 text-sm text-ink-2 hover:text-ink">
                <span className="block leading-snug">
                  <span className="mr-1.5 inline-block w-3" aria-hidden>
                    <span className="group-open:hidden">+</span>
                    <span className="hidden group-open:inline">−</span>
                  </span>
                  {entry.label}
                </span>
                {entry.feed && <Tally posts={entry.feed.posts} />}
              </summary>
              {entry.feed && <PostList entry={entry} filter={filter} limit={20} />}
            </details>
          ),
        )}
      </div>
    </section>
  );
}

const PREVIEW_POSTS = 8;

function LatestBatch({ entry, filter, retry }: { entry: FeedEntry; filter: CoalitionId | 'all'; retry: () => void }) {
  const [all, setAll] = useState(false);
  return (
    <div aria-busy={entry.status === 'loading'}>
      <div className="border-b border-rule pb-2">
        <h3 className="text-sm leading-snug font-semibold">{entry.label}</h3>
        {entry.feed && <Tally posts={entry.feed.posts} />}
      </div>
      {entry.status === 'loading' && <FeedSkeleton />}
      {entry.status === 'error' && (
        <div role="alert" className="mt-3 text-sm">
          <p>{analysisErrorText(entry.error)}</p>
          <button type="button" onClick={retry} className="mt-2 font-semibold underline underline-offset-4">
            Load the reactions again
          </button>
        </div>
      )}
      {entry.feed && (
        <>
          <PostList entry={entry} filter={filter} limit={all ? 20 : PREVIEW_POSTS} />
          {!all && filter === 'all' && (
            <button type="button" onClick={() => setAll(true)} className="mt-2 text-sm font-semibold text-ink-2 underline-offset-4 hover:text-ink hover:underline">
              Show all 20 voices
            </button>
          )}
        </>
      )}
    </div>
  );
}

function PostList({ entry, filter, limit }: { entry: FeedEntry; filter: CoalitionId | 'all'; limit: number }) {
  const rows = threadPosts(entry.feed!.posts).filter(({ post }) => filter === 'all' || coalitionOfPost(post) === filter);
  return (
    <ol role="feed" aria-label={`Reactions, ${entry.label}`} className="mt-1 divide-y divide-rule">
      {rows.slice(0, filter === 'all' ? limit : rows.length).map(({ post, depth }) => (
        <PostCard key={post.archetype_id} post={post} depth={depth} turnId={entry.feed!.turn_id} />
      ))}
    </ol>
  );
}

function Tally({ posts }: { posts: FeedPost[] }) {
  const t = tally(posts);
  return (
    <span className="mt-0.5 block text-xs text-ink-2 tabular-nums">
      {t.support} approve, {t.oppose} disapprove, {t.mixed} undecided
    </span>
  );
}

function PostCard({ post, depth, turnId }: { post: FeedPost; depth: 0 | 1; turnId: string }) {
  const a = ARCHETYPES.find((x) => x.id === post.archetype_id)!;
  const replyTo = post.reply_to_archetype_id ? ARCHETYPES.find((x) => x.id === post.reply_to_archetype_id) : null;
  const { likes, reposts } = engagement(post, turnId);
  const initials = a.name.split(' ').map((w) => w[0]).join('');

  return (
    <li className={`py-3 ${depth ? 'ml-6 border-l-2 border-rule pl-3' : ''}`}>
      <article aria-label={`${a.name}: ${STANCE_WORD[post.stance]}`}>
        <div className="flex gap-2.5">
          <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink text-xs font-semibold text-white" aria-hidden>
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline gap-x-1.5 text-sm">
              <span className="font-semibold">{a.name}</span>
              <span className="text-ink-3">{a.handle}</span>
            </div>
            <div className="text-xs text-ink-3">
              {a.age}, {a.city}, {a.state}; {FACTIONS[a.faction].label}
            </div>
            {replyTo && <div className="mt-1 text-xs text-ink-2">Replying to {replyTo.handle}</div>}
            <p className="mt-1.5 text-[0.95rem] leading-snug">{post.text}</p>
            {post.hashtags.length > 0 && <p className="mt-1 text-sm text-ink-2">{post.hashtags.join(' ')}</p>}
            <div className="mt-2 flex flex-wrap gap-x-4 text-xs text-ink-3 tabular-nums">
              <span className="font-medium text-ink-2">{STANCE_WORD[post.stance]}</span>
              <span>{compactNumber(likes)} likes</span>
              <span>{compactNumber(reposts)} reposts</span>
            </div>
          </div>
        </div>
      </article>
    </li>
  );
}

function FeedSkeleton() {
  return (
    <ul className="mt-3 space-y-4" aria-hidden>
      {[0, 1, 2].map((i) => (
        <li key={i} className="flex gap-2.5">
          <div className="h-9 w-9 rounded-full bg-rule/70" />
          <div className="flex-1 space-y-2">
            <div className="h-3 w-1/2 rounded bg-rule/70" />
            <div className="h-3 w-full rounded bg-rule/50" />
            <div className="h-3 w-4/5 rounded bg-rule/50" />
          </div>
        </li>
      ))}
    </ul>
  );
}
