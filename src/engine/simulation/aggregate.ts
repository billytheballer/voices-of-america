import { ELECTORAL_VOTES_TO_WIN, HOUSE_SEATS, SENATE_SEATS, STATE_CODES, TOTAL_ELECTORAL_VOTES } from '@/domain/constants';
import { SEAT_MODEL } from '@/data/balance.config';
import type { StateCode } from '@/domain/types';
import type { RunOutcome } from './monteCarlo';
import type {
  ChamberSummary,
  CongressResult,
  ElectoralUnit,
  MonteCarloResult,
  MonteCarloSnapshot,
  SimulationInput,
  StateSummary,
} from './types';

/**
 * Streaming accumulator. Typed arrays keep 10k runs × 51 states at ~2 MB and
 * allocation-free in the hot loop.
 */
export interface Accumulator {
  units: ElectoralUnit[];
  capacity: number;
  count: number;
  evHistogram: Int32Array;
  evs: Int32Array;
  popularMargins: Float64Array;
  /** stateMargins[stateIdx * capacity + run] */
  stateMargins: Float32Array;
  stateWins: Int32Array;
  unitWins: Int32Array;
  tippingCounts: Int32Array;
  wins: number;
  ties: number;
  popularWins: number;
  splits: number;
  /** Scratch buffer for the tipping-point sort. */
  order: number[];
  houseHistogram: Int32Array;
  senateHistogram: Int32Array;
  houseSeatsByRun: Int32Array;
  senateSeatsByRun: Int32Array;
  houseMajorities: number;
  senateControls: number;
  raceWins: Int32Array;
  trackCongress: boolean;
}

/** `senateRaces` = number of Senate races to track, or null to skip Congress entirely. */
export function createAccumulator(units: ElectoralUnit[], capacity: number, senateRaces: number | null = null): Accumulator {
  return {
    units,
    capacity,
    count: 0,
    evHistogram: new Int32Array(TOTAL_ELECTORAL_VOTES + 1),
    evs: new Int32Array(capacity),
    popularMargins: new Float64Array(capacity),
    stateMargins: new Float32Array(STATE_CODES.length * capacity),
    stateWins: new Int32Array(STATE_CODES.length),
    unitWins: new Int32Array(units.length),
    tippingCounts: new Int32Array(units.length),
    wins: 0,
    ties: 0,
    popularWins: 0,
    splits: 0,
    order: units.map((_, i) => i),
    houseHistogram: new Int32Array(HOUSE_SEATS + 1),
    senateHistogram: new Int32Array(SENATE_SEATS + 1),
    houseSeatsByRun: new Int32Array(capacity),
    senateSeatsByRun: new Int32Array(capacity),
    houseMajorities: 0,
    senateControls: 0,
    raceWins: new Int32Array(senateRaces ?? 0),
    trackCongress: senateRaces !== null,
  };
}

/**
 * Tipping point: order units from the winner's best to worst; the unit that
 * delivers the 270th EV is the tipping point. Ties have none.
 */
export function tippingPointIndex(units: ElectoralUnit[], unitMargins: Float64Array, playerEV: number, order: number[]): number {
  if (playerEV === TOTAL_ELECTORAL_VOTES / 2) return -1;
  const playerWon = playerEV >= ELECTORAL_VOTES_TO_WIN;
  order.sort((a, b) => (playerWon ? unitMargins[b]! - unitMargins[a]! : unitMargins[a]! - unitMargins[b]!));
  let cum = 0;
  for (const i of order) {
    cum += units[i]!.electoralVotes;
    if (cum >= ELECTORAL_VOTES_TO_WIN) return i;
  }
  return -1;
}

export function recordRun(acc: Accumulator, run: RunOutcome): void {
  if (acc.count >= acc.capacity) throw new Error('Accumulator full');
  const r = acc.count++;
  const won = run.playerEV >= ELECTORAL_VOTES_TO_WIN;
  const tie = run.playerEV === TOTAL_ELECTORAL_VOTES / 2;
  const pvWon = run.popularMargin > 0;

  acc.evHistogram[run.playerEV]!++;
  acc.evs[r] = run.playerEV;
  acc.popularMargins[r] = run.popularMargin;
  if (won) acc.wins++;
  if (tie) acc.ties++;
  if (pvWon) acc.popularWins++;
  if (!tie && won !== pvWon) acc.splits++;

  for (let i = 0; i < STATE_CODES.length; i++) {
    const m = run.stateMargins[i]!;
    acc.stateMargins[i * acc.capacity + r] = m;
    if (m > 0) acc.stateWins[i]!++;
  }
  for (let k = 0; k < acc.units.length; k++) if (run.unitMargins[k]! > 0) acc.unitWins[k]!++;

  const tp = tippingPointIndex(acc.units, run.unitMargins, run.playerEV, acc.order);
  if (tp >= 0) acc.tippingCounts[tp]!++;

  if (acc.trackCongress) {
    acc.houseHistogram[run.houseSeats]!++;
    acc.senateHistogram[run.senateSeats]!++;
    acc.houseSeatsByRun[r] = run.houseSeats;
    acc.senateSeatsByRun[r] = run.senateSeats;
    if (run.houseSeats >= SEAT_MODEL.houseMajority) acc.houseMajorities++;
    if (
      run.senateSeats >= SEAT_MODEL.senateMajority ||
      (run.senateSeats === SENATE_SEATS / 2 && run.playerHoldsVP)
    )
      acc.senateControls++;
    for (let k = 0; k < acc.raceWins.length; k++) acc.raceWins[k]! += run.senateRaceWins[k]!;
  }
}

function chamberSummary(byRun: Int32Array, histogram: Int32Array, majorities: number, n: number): ChamberSummary {
  const sorted = Int32Array.from(byRun.subarray(0, n)).sort();
  return {
    mean: mean(sorted),
    median: percentile(sorted, 0.5),
    p5: percentile(sorted, 0.05),
    p95: percentile(sorted, 0.95),
    majorityProbability: majorities / n,
    histogram: Array.from(histogram),
  };
}

/** Percentile of a sorted array (linear interpolation). */
export function percentile(sorted: ArrayLike<number>, q: number): number {
  if (sorted.length === 0) return NaN;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (pos - lo);
}

const mean = (xs: ArrayLike<number>) => {
  let s = 0;
  for (let i = 0; i < xs.length; i++) s += xs[i]!;
  return s / xs.length;
};

export function snapshot(acc: Accumulator): MonteCarloSnapshot {
  const n = acc.count;
  const stateWinProbability = {} as Record<StateCode, number>;
  STATE_CODES.forEach((s, i) => (stateWinProbability[s] = acc.stateWins[i]! / n));
  return {
    completedRuns: n,
    totalRuns: acc.capacity,
    winProbability: acc.wins / n,
    meanElectoralVotes: mean(acc.evs.subarray(0, n)),
    stateWinProbability,
  };
}

export function finalize(acc: Accumulator, input: SimulationInput): MonteCarloResult {
  const n = acc.count;
  const evSorted = Int32Array.from(acc.evs.subarray(0, n)).sort();
  const pvSorted = Float64Array.from(acc.popularMargins.subarray(0, n)).sort();

  const states = {} as Record<StateCode, StateSummary>;
  STATE_CODES.forEach((s, i) => {
    const slice = acc.stateMargins.subarray(i * acc.capacity, i * acc.capacity + n);
    const sorted = Float32Array.from(slice).sort();
    states[s] = {
      winProbability: acc.stateWins[i]! / n,
      meanMargin: mean(slice),
      p5Margin: percentile(sorted, 0.05),
      p95Margin: percentile(sorted, 0.95),
    };
  });

  const districts: Record<string, { winProbability: number }> = {};
  acc.units.forEach((u, k) => {
    if (u.isDistrict || u.id.endsWith('-AL')) districts[u.id] = { winProbability: acc.unitWins[k]! / n };
  });

  const tippingPoints = acc.units
    .map((u, k) => ({ unitId: u.id, probability: acc.tippingCounts[k]! / n }))
    .filter((t) => t.probability > 0)
    .sort((a, b) => b.probability - a.probability)
    .slice(0, 10);

  return {
    seed: input.seed,
    runs: n,
    winProbability: acc.wins / n,
    tieProbability: acc.ties / n,
    lossProbability: (n - acc.wins - acc.ties) / n,
    popularVoteWinProbability: acc.popularWins / n,
    splitProbability: acc.splits / n,
    electoralVotes: {
      mean: mean(evSorted),
      median: percentile(evSorted, 0.5),
      p5: percentile(evSorted, 0.05),
      p95: percentile(evSorted, 0.95),
      histogram: Array.from(acc.evHistogram),
    },
    popularVote: {
      meanMargin: mean(pvSorted),
      p5Margin: percentile(pvSorted, 0.05),
      p95Margin: percentile(pvSorted, 0.95),
    },
    states,
    districts,
    tippingPoints,
    ...(input.congress
      ? {
          congress: {
            house: chamberSummary(acc.houseSeatsByRun, acc.houseHistogram, acc.houseMajorities, n),
            senate: chamberSummary(acc.senateSeatsByRun, acc.senateHistogram, acc.senateControls, n),
            senateRaces: Object.fromEntries(
              input.congress.senateRaces.map((race, k) => [
                race.state,
                { winProbability: acc.raceWins[k]! / n, holder: race.holder },
              ]),
            ),
          } satisfies CongressResult,
        }
      : {}),
  };
}
