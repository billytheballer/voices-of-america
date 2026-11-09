import { FACTION_IDS, STATE_CODES } from '@/domain/constants';
import type { FactionRecord, Party, StateCode } from '@/domain/types';
import { MONTE_CARLO, SEAT_MODEL } from '@/data/balance.config';
import { STATES } from '@/data/states';
import type { StateElectorate } from '@/data/derive/stateElectorate';
import type { ElectionContext, ElectorateMap } from '../types';
import { stateVote, stateVoterWeight } from '../electorate/voteShare';
import type { CongressSimInput, ElectoralUnit, SimulationInput } from './types';
import type { CongressState } from '../legislature/types';
import { seatsUp } from '../legislature/seatModel';

/** One turnout point, used for the finite-difference sensitivity. */
const TURNOUT_STEP = 0.01;

/**
 * How much a state's margin moves if one faction's turnout rises by 1 point.
 * This is what turns a national "progressives surged" or "America First stayed
 * home" surprise into a state-specific swing, correctly shaped by each state's
 * faction mix.
 */
export function turnoutSensitivity(
  state: StateCode,
  electorate: StateElectorate,
  ctx: ElectionContext,
): FactionRecord<number> {
  const base = stateVote(state, electorate, ctx).rawMargin;
  const out = {} as FactionRecord<number>;
  for (const f of FACTION_IDS) {
    const bumped: StateElectorate = {
      ...electorate,
      [f]: { ...electorate[f], turnoutShift: electorate[f].turnoutShift + TURNOUT_STEP },
    };
    out[f] = stateVote(state, bumped, ctx).rawMargin - base;
  }
  return out;
}

export interface PrepareOptions {
  seed: number;
  runs?: number;
  horizonTurns?: number;
  config?: SimulationInput['config'];
  kind?: SimulationInput['kind'];
  congress?: CongressSimInput;
}

/** Snapshot the current electorate into a plain SimulationInput. */
export function buildSimulationInput(
  electorate: ElectorateMap,
  ctx: ElectionContext,
  calibration: Record<StateCode, number>,
  { seed, runs, horizonTurns = 0, config = MONTE_CARLO, kind = 'presidential', congress }: PrepareOptions,
): SimulationInput {
  const stateMargins = {} as Record<StateCode, number>;
  const stateWeights = {} as Record<StateCode, number>;
  const sensitivity = {} as Record<StateCode, FactionRecord<number>>;

  for (const s of STATE_CODES) {
    const r = stateVote(s, electorate[s], ctx, calibration[s]);
    stateMargins[s] = r.margin;
    stateWeights[s] = stateVoterWeight(s) * r.turnout;
    sensitivity[s] = turnoutSensitivity(s, electorate[s], ctx);
  }

  return {
    seed,
    runs: runs ?? config.defaultRuns,
    playerParty: ctx.playerParty,
    stateMargins,
    stateWeights,
    turnoutSensitivity: sensitivity,
    horizonTurns,
    config,
    kind,
    incumbentParty: ctx.incumbentParty,
    ...(congress ? { congress } : {}),
  };
}

/** Builds the Congress portion of a simulation from the current Congress and the election year. */
export function buildCongressSimInput(
  congress: CongressState,
  year: number,
  playerParty: Party,
  seatModel = SEAT_MODEL,
): CongressSimInput {
  const up = seatsUp(congress, year);
  const upKeys = new Set(up.map((x) => `${x.state}:${x.senateClass}`));
  const holdovers = congress.senate.filter((x) => !upKeys.has(`${x.state}:${x.senateClass}`));
  const player = holdovers.filter((x) => x.holder === playerParty).length;
  return {
    houseSeats: Object.fromEntries(STATE_CODES.map((s) => [s, STATES[s].houseSeats])) as Record<StateCode, number>,
    senateRaces: up.map((x) => ({ state: x.state, holder: x.holder })),
    senateHoldovers: { player, opposition: holdovers.length - player },
    seatModel,
  };
}

/**
 * Expands the 51 states into EV-awarding units. Maine and Nebraska become
 * an at-large unit (2 EVs) plus one unit per district.
 */
export function buildElectoralUnits(playerParty: SimulationInput['playerParty']): ElectoralUnit[] {
  const sign = playerParty === 'R' ? 1 : -1;
  const units: ElectoralUnit[] = [];
  for (const s of STATE_CODES) {
    const p = STATES[s];
    if (!p.districts) {
      units.push({ id: s, state: s, region: p.region, electoralVotes: p.electoralVotes, offset: 0, isDistrict: false });
      continue;
    }
    units.push({ id: `${s}-AL`, state: s, region: p.region, electoralVotes: 2, offset: 0, isDistrict: false });
    for (const d of p.districts) {
      units.push({
        id: d.id,
        state: s,
        region: p.region,
        electoralVotes: 1,
        offset: sign * (d.lean - p.lean),
        isDistrict: true,
      });
    }
  }
  return units;
}
