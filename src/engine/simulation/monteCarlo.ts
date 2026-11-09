import { ELECTORAL_VOTES_TO_WIN, FACTION_IDS, REGION_IDS, STATE_CODES } from '@/domain/constants';
import { FACTIONS } from '@/data/factions';
import { STATES } from '@/data/states';
import { createRng, type Rng } from '../rng';
import { buildElectoralUnits } from './prepare';
import { sampleStateHouseSeats, senateBaseMargin } from '../legislature/seatModel';
import { createAccumulator, finalize, recordRun, snapshot, type Accumulator } from './aggregate';
import type { ElectoralUnit, MonteCarloResult, MonteCarloSnapshot, SimulationInput } from './types';

/**
 * 10,000-run election simulator with CORRELATED error.
 *
 * Each run draws:
 *   ε_nat     one national error (Student-t: fat tails, same SD)
 *   ε_region  one error per region (Rust Belt states miss together)
 *   τ_f       one national turnout surprise per faction, mapped to every
 *             state through its turnout sensitivity
 *   ε_state   idiosyncratic state error (+ district error for ME/NE)
 *
 *   margin_s = base_s + h·(ε_nat + ε_region(s) + ε_state) + h·Σ_f sens_s,f · τ_f
 *
 * where h = sqrt(1 + horizonGrowth · turnsUntilElection) widens the cone
 * further from election day. Independent per-state noise would make 10k
 * runs absurdly confident; correlation is what makes the forecast honest.
 */

/** Everything a run needs, resolved once up front for speed. */
interface Prepared {
  input: SimulationInput;
  units: ElectoralUnit[];
  stateIndex: Map<string, number>;
  regionOfState: Int32Array;
  baseMargins: Float64Array;
  /** sensitivity[stateIdx * F + factionIdx] */
  sensitivity: Float64Array;
  weights: Float64Array;
  turnoutSd: Float64Array;
  h: number;
  /** Congress, resolved to indices (null = presidency only). */
  congress: {
    houseSeats: Int32Array;
    raceStateIdx: Int32Array;
    /** Race base offset from the state margin (incumbency), player perspective. */
    raceOffset: Float64Array;
    holdovers: { player: number; opposition: number };
    seatModel: NonNullable<SimulationInput['congress']>['seatModel'];
  } | null;
}

export function prepare(input: SimulationInput): Prepared {
  const S = STATE_CODES.length;
  const F = FACTION_IDS.length;
  const regionIdx = new Map(REGION_IDS.map((r, i) => [r, i]));
  const regionOfState = new Int32Array(S);
  const baseMargins = new Float64Array(S);
  const weights = new Float64Array(S);
  const sensitivity = new Float64Array(S * F);
  STATE_CODES.forEach((s, i) => {
    regionOfState[i] = regionIdx.get(STATES[s].region)!;
    baseMargins[i] = input.stateMargins[s];
    weights[i] = input.stateWeights[s];
    FACTION_IDS.forEach((f, j) => (sensitivity[i * F + j] = input.turnoutSensitivity[s][f]));
  });
  const turnoutSd = new Float64Array(FACTION_IDS.map((f) => input.config.sigmaTurnout * FACTIONS[f].turnoutElasticity));
  const stateIndex = new Map(STATE_CODES.map((s, i) => [s, i]));
  const c = input.congress;
  const congress = c
    ? {
        houseSeats: Int32Array.from(STATE_CODES.map((s) => c.houseSeats[s])),
        raceStateIdx: Int32Array.from(c.senateRaces.map((r) => stateIndex.get(r.state)!)),
        raceOffset: Float64Array.from(
          c.senateRaces.map((r) => senateBaseMargin(0, r.holder, input.playerParty, c.seatModel)),
        ),
        holdovers: c.senateHoldovers,
        seatModel: c.seatModel,
      }
    : null;
  return {
    input,
    units: buildElectoralUnits(input.playerParty),
    stateIndex,
    regionOfState,
    baseMargins,
    sensitivity,
    weights,
    turnoutSd,
    h: Math.sqrt(1 + input.config.horizonGrowth * Math.max(0, input.horizonTurns)),
    congress,
  };
}

/** Student-t draw rescaled to unit variance. */
function unitStudentT(rng: Rng, df: number): number {
  let chi2 = 0;
  for (let k = 0; k < df; k++) {
    const g = rng.gaussian();
    chi2 += g * g;
  }
  const t = rng.gaussian() / Math.sqrt(chi2 / df);
  return df > 2 ? t * Math.sqrt((df - 2) / df) : t;
}

export interface RunOutcome {
  /** Per-state margins (STATE_CODES order). */
  stateMargins: Float64Array;
  /** Per-unit margins (units order). */
  unitMargins: Float64Array;
  playerEV: number;
  popularMargin: number;
  /** Congress results (0 / empty when not simulated). */
  houseSeats: number;
  senateSeats: number;
  senateRaceWins: Uint8Array;
  /** Player's party House seats per state (STATE_CODES order). */
  houseByState: Int16Array;
  /** Does the player's party hold the VP tie-breaker after this election? */
  playerHoldsVP: boolean;
}

/** One simulated election. Buffers are reused across runs to avoid allocation. */
export function simulateRun(p: Prepared, rng: Rng, out?: RunOutcome): RunOutcome {
  const { config } = p.input;
  const S = STATE_CODES.length;
  const F = FACTION_IDS.length;
  const res: RunOutcome = out ?? {
    stateMargins: new Float64Array(S),
    unitMargins: new Float64Array(p.units.length),
    playerEV: 0,
    popularMargin: 0,
    houseSeats: 0,
    senateSeats: 0,
    senateRaceWins: new Uint8Array(p.congress ? p.congress.raceStateIdx.length : 0),
    houseByState: new Int16Array(p.congress ? S : 0),
    playerHoldsVP: false,
  };

  const nat = config.sigmaNational * unitStudentT(rng, config.nationalDf);
  const regional = REGION_IDS.map(() => rng.normal(0, config.sigmaRegional));
  const turnout = new Float64Array(F);
  for (let j = 0; j < F; j++) turnout[j] = rng.normal(0, p.turnoutSd[j]!);

  let pvNum = 0;
  let pvDen = 0;
  for (let i = 0; i < S; i++) {
    let turnoutEffect = 0;
    for (let j = 0; j < F; j++) turnoutEffect += p.sensitivity[i * F + j]! * turnout[j]!;
    const error = nat + regional[p.regionOfState[i]!]! + rng.normal(0, config.sigmaState) + turnoutEffect;
    const m = p.baseMargins[i]! + p.h * error;
    res.stateMargins[i] = m;
    pvNum += p.weights[i]! * m;
    pvDen += p.weights[i]!;
  }

  let ev = 0;
  p.units.forEach((u, k) => {
    const parent = res.stateMargins[p.stateIndex.get(u.state)!]!;
    const m = u.isDistrict ? parent + u.offset + p.h * rng.normal(0, config.sigmaDistrict) : parent;
    res.unitMargins[k] = m;
    if (m > 0) ev += u.electoralVotes;
  });

  res.playerEV = ev;
  res.popularMargin = pvNum / pvDen;
  res.playerHoldsVP =
    p.input.kind === 'presidential' ? ev >= ELECTORAL_VOTES_TO_WIN : p.input.incumbentParty === p.input.playerParty;

  if (p.congress) simulateCongress(p, rng, res);
  return res;
}

/** House via the seat–vote curve on each state's (House-swung) margin; Senate race by race. */
function simulateCongress(p: Prepared, rng: Rng, res: RunOutcome): void {
  const c = p.congress!;
  const houseSwing = p.h * rng.normal(0, c.seatModel.sigmaHouseNational);
  let house = 0;
  for (let i = 0; i < c.houseSeats.length; i++) {
    const seats = c.houseSeats[i]!;
    const won = seats > 0 ? sampleStateHouseSeats(rng, seats, res.stateMargins[i]! + houseSwing) : 0;
    res.houseByState[i] = won;
    house += won;
  }
  let senate = c.holdovers.player;
  for (let k = 0; k < c.raceStateIdx.length; k++) {
    const m =
      res.stateMargins[c.raceStateIdx[k]!]! + c.raceOffset[k]! + p.h * rng.normal(0, c.seatModel.sigmaSenateCandidate);
    const won = m > 0 ? 1 : 0;
    res.senateRaceWins[k] = won;
    senate += won;
  }
  res.houseSeats = house;
  res.senateSeats = senate;
}

/**
 * One realization: what actually happens on election night. Same model as
 * the forecast, drawn from the game's RNG stream rather than the forecast's.
 */
export function resolveElection(input: SimulationInput, rng: Rng): RunOutcome {
  return simulateRun(prepare(input), rng);
}

/** Synchronous full run (tests, Node, fallback when Workers are unavailable). */
export function runMonteCarlo(input: SimulationInput): MonteCarloResult {
  const p = prepare(input);
  const rng = createRng(input.seed).fork('monte-carlo');
  const acc = createAccumulator(p.units, input.runs, p.congress ? p.congress.raceStateIdx.length : null);
  const buf = simulateRun(p, rng);
  recordRun(acc, buf);
  for (let r = 1; r < input.runs; r++) recordRun(acc, simulateRun(p, rng, buf));
  return finalize(acc, input);
}

/**
 * Chunked async runner: yields a snapshot after each chunk so the UI can
 * paint the map live and the worker can honor cancellation between chunks.
 * Produces bit-identical results to runMonteCarlo for the same input.
 */
export async function* runMonteCarloChunked(
  input: SimulationInput,
): AsyncGenerator<MonteCarloSnapshot, MonteCarloResult, void> {
  const p = prepare(input);
  const rng = createRng(input.seed).fork('monte-carlo');
  const acc: Accumulator = createAccumulator(p.units, input.runs, p.congress ? p.congress.raceStateIdx.length : null);
  let buf: RunOutcome | undefined;
  let done = 0;
  while (done < input.runs) {
    const n = Math.min(input.config.chunkSize, input.runs - done);
    for (let r = 0; r < n; r++) {
      buf = simulateRun(p, rng, buf);
      recordRun(acc, buf);
    }
    done += n;
    if (done < input.runs) yield snapshot(acc);
  }
  return finalize(acc, input);
}

export const isWin = (ev: number) => ev >= ELECTORAL_VOTES_TO_WIN;
