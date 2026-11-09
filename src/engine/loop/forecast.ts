import { MONTE_CARLO } from '@/data/balance.config';
import { hashString } from '../rng';
import { buildCongressSimInput, buildSimulationInput } from '../simulation/prepare';
import type { SimulationInput } from '../simulation/types';
import type { ElectionContext } from '../types';
import { isMidtermYear, turnsUntilElection } from './calendar';
import type { GameState } from './types';

/** The ElectionContext implied by the current game state. */
export function electionContext(state: GameState, forYear = nextElectionYear(state)): ElectionContext {
  return {
    playerParty: state.player.party,
    playerPlatform: state.playerPlatform,
    oppositionPlatform: state.oppositionPlatform,
    isMidterm: isMidtermYear(forYear),
    incumbentParty: state.incumbentParty,
  };
}

export const nextElectionYear = (state: GameState) => (state.year % 2 === 0 ? state.year : state.year + 1);

/**
 * Builds the forecast Monte Carlo for the next election (presidency + Congress).
 * Its seed is DERIVED from the game state but does not advance the game's RNG,
 * so opening the forecast never changes what happens next.
 */
export function buildForecastInput(state: GameState, runs: number = MONTE_CARLO.defaultRuns): SimulationInput {
  const year = nextElectionYear(state);
  const ctx = electionContext(state, year);
  return buildSimulationInput(state.electorate, ctx, state.calibration, {
    seed: hashString(`forecast:${state.seed}:${state.turn}`),
    runs,
    horizonTurns: turnsUntilElection(state.year, state.quarter),
    kind: ctx.isMidterm ? 'midterm' : 'presidential',
    congress: buildCongressSimInput(state.congress, year, state.player.party),
  });
}
