import { useEffect, useRef, useState } from 'react';
import type { FeedBatch } from '@/domain/schemas/feedBatch.schema';
import type { GameState } from '@/engine/loop/types';
import { getLLMProvider } from '@/services/llm';
import { buildFeedRequest, feedKey, type ActedBill } from '@/features/voter-feed/feedModel';

export interface FeedEntry {
  key: string;
  /** "Q2 2029" plus what prompted it. */
  label: string;
  status: 'loading' | 'ready' | 'error';
  feed?: FeedBatch;
  error?: unknown;
}

const MAX_BATCHES = 4;

/**
 * Generates one feed per quarter, plus one after each bill or order is acted
 * on. Keyed so that re-renders (and the many small state changes in a turn)
 * never trigger extra model calls.
 */
export function useVoterFeed(game: GameState, acted: ActedBill | null) {
  const [entries, setEntries] = useState<FeedEntry[]>([]);
  const requested = useRef(new Set<string>());
  const seed = useRef(game.seed);
  const [retryToken, setRetryToken] = useState(0);

  // New campaign → fresh feed.
  if (seed.current !== game.seed) {
    seed.current = game.seed;
    requested.current.clear();
    if (entries.length) setEntries([]);
  }

  const key = feedKey(game, acted);

  useEffect(() => {
    if (requested.current.has(key)) return;
    requested.current.add(key);
    const label = `Q${game.quarter} ${game.year}${acted ? `, after ${acted.bill.title}` : ''}`;
    const ac = new AbortController();
    setEntries((prev) => [{ key, label, status: 'loading' as const }, ...prev.filter((e) => e.key !== key)].slice(0, MAX_BATCHES));
    getLLMProvider()
      .generateFeed(buildFeedRequest(game, acted), ac.signal)
      .then((feed) => setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, status: 'ready', feed } : e))))
      .catch((error: unknown) => {
        if (ac.signal.aborted) return;
        requested.current.delete(key); // allow a retry
        setEntries((prev) => prev.map((e) => (e.key === key ? { ...e, status: 'error', error } : e)));
      });
    // Only the key decides when to generate; game/acted are read at that moment.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, retryToken]);

  return { entries, retry: () => setRetryToken((t) => t + 1) };
}
