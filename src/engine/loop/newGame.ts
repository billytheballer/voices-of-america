import { START_YEAR, STATE_CODES } from '@/domain/constants';
import type { Party, StateCode } from '@/domain/types';
import { FACTION_LIST } from '@/data/factions';
import { STATES } from '@/data/states';
import { DIFFICULTY, GAME_LOOP, type Difficulty } from '@/data/balance.config';
import { INITIAL_METRICS, STARTING_POLITICAL_CAPITAL } from '@/data/initialState';
import { createRng } from '../rng';
import { buildInitialElectorate } from '../electorate/initElectorate';
import { calibrateStates } from '../electorate/voteShare';
import { computePartyAnchor, opposingParty } from '../opposition/reactiveBaseline';
import { buildStartingCongress } from '../legislature/seatModel';
import { drawEvent, applyEvent } from '../events/eventTicker';
import { phaseFor } from './calendar';
import { defaultCampaign } from '../campaign/campaign';
import { drawRace } from '../campaign/race';
import { defaultDepartments } from '../government/departments';
import type { GameState, NewGameOptions } from './types';

/**
 * Uniform shift that puts the tipping-point state at a 0-point margin:
 * sort states by margin, walk down until the player reaches 270 EVs, and
 * take minus that state's margin. Instant and deterministic, with no
 * simulation needed.
 */
export function tippingPointShift(margins: Record<StateCode, number>): number {
  const sorted = [...STATE_CODES].sort((a, b) => margins[b] - margins[a]);
  let ev = 0;
  for (const s of sorted) {
    ev += STATES[s].electoralVotes;
    if (ev >= 270) return -margins[s];
  }
  return 0;
}

export function difficultyShift(difficulty: Difficulty, party: Party): number {
  const d = DIFFICULTY[difficulty];
  if (d.mode === 'none') return 0;
  const sign = party === 'R' ? 1 : -1;
  const openingMargins = Object.fromEntries(STATE_CODES.map((s) => [s, sign * STATES[s].lean])) as Record<
    StateCode,
    number
  >;
  return tippingPointShift(openingMargins) + d.offset;
}

export function newGame({ seed, playerName, party, difficulty = 'realistic' }: NewGameOptions): GameState {
  const electorate = buildInitialElectorate();
  const shift = difficultyShift(difficulty, party);
  const base = calibrateStates(electorate, party);
  const calibration = Object.fromEntries(STATE_CODES.map((s) => [s, base[s] + shift])) as Record<StateCode, number>;

  const year = START_YEAR;
  const quarter = 1 as const;
  const rng = createRng(seed);
  const opening = drawEvent(rng, INITIAL_METRICS, {});
  // The other party holds the White House at the start, so the player gains from the
  // incumbent's troubles (see blameFactor in actions.ts).
  const blame = GAME_LOOP.openingIncumbentParty === party ? 1 : -GAME_LOOP.challengerPressureShare;
  const afterEvent = applyEvent(opening, INITIAL_METRICS, electorate, blame);

  return {
    version: 1,
    seed,
    rngState: rng.state,
    difficulty,
    player: { name: playerName, party, termsServed: 0, generation: 0, isPresident: false },
    year,
    quarter,
    turn: 0,
    phase: phaseFor(year, quarter, false),
    electorate: afterEvent.electorate,
    calibration,
    metrics: afterEvent.metrics,
    politicalCapital: STARTING_POLITICAL_CAPITAL,
    playerPlatform: computePartyAnchor(party, FACTION_LIST),
    oppositionPlatform: computePartyAnchor(opposingParty(party), FACTION_LIST),
    congress: buildStartingCongress(),
    incumbentParty: GAME_LOOP.openingIncumbentParty,
    eventHistory: { [opening.id]: 0 },
    currentEventId: opening.id,
    turnBills: [],
    log: [],
    elections: [],
    gameOver: null,
    campaign: defaultCampaign(),
    departments: defaultDepartments(),
    race: drawRace({ seed, player: { name: playerName, party, termsServed: 0, generation: 0, isPresident: false } }, year, []),
  };
}
