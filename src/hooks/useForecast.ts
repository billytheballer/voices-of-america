import { useEffect, useMemo } from 'react';
import { buildForecastInput, nextElectionYear } from '@/engine/loop/forecast';
import type { GameState } from '@/engine/loop/types';
import { useMonteCarlo } from './useMonteCarlo';

/**
 * One forecast per game state, shared by the forecast panel and the map so
 * the 10,000 runs happen once. Re-runs whenever the game state changes.
 */
export function useForecast(game: GameState) {
  const mc = useMonteCarlo();
  const input = useMemo(() => buildForecastInput(game), [game]);
  const { run } = mc;
  useEffect(() => run(input), [input, run]);
  return { ...mc, kind: input.kind, year: nextElectionYear(game) };
}

export type Forecast = ReturnType<typeof useForecast>;
