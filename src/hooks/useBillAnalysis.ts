import { useCallback, useEffect, useRef, useState } from 'react';
import type { BillAnalysis } from '@/domain/schemas/billAnalysis.schema';
import type { GameState } from '@/engine/loop/types';
import { currentEvent } from '@/engine/loop/actions';
import { getLLMProvider } from '@/services/llm';

export type AnalysisState =
  | { status: 'idle' }
  | { status: 'analyzing'; text: string }
  | { status: 'ready'; text: string; analysis: BillAnalysis }
  | { status: 'error'; text: string; error: unknown };

/**
 * Sends a draft to the bill parser (mock or Claude via the proxy). A new
 * request cancels any in flight; unmounting cancels too.
 */
export function useBillAnalysis(game: GameState) {
  const [state, setState] = useState<AnalysisState>({ status: 'idle' });
  const controller = useRef<AbortController | null>(null);

  const analyze = useCallback(
    async (text: string) => {
      controller.current?.abort();
      const ac = new AbortController();
      controller.current = ac;
      setState({ status: 'analyzing', text });
      try {
        const analysis = await getLLMProvider().parseBill(
          {
            text,
            context: {
              year: game.year,
              quarter: game.quarter,
              playerParty: game.player.party,
              metrics: game.metrics,
              currentEvent: currentEvent(game).headline,
            },
          },
          ac.signal,
        );
        if (!ac.signal.aborted) setState({ status: 'ready', text, analysis });
      } catch (error) {
        if (!ac.signal.aborted) setState({ status: 'error', text, error });
      }
    },
    [game],
  );

  const cancel = useCallback(() => {
    controller.current?.abort();
    setState({ status: 'idle' });
  }, []);

  useEffect(() => () => controller.current?.abort(), []);

  return { state, analyze, cancel, reset: cancel };
}
