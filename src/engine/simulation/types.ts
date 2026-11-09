import type { FactionRecord, Party, RegionId, StateCode } from '@/domain/types';
import type { MonteCarloConfig, SEAT_MODEL } from '@/data/balance.config';

export type SeatModelConfig = typeof SEAT_MODEL;

/**
 * Plain-data input to the Monte Carlo. Everything is precomputed from the
 * electorate on the main thread (see prepare.ts), so the worker only does
 * noise and counting. The input is structured-clone safe.
 */
export interface SimulationInput {
  seed: number;
  runs: number;
  playerParty: Party;
  /** Calibrated player-perspective margins, in points. */
  stateMargins: Record<StateCode, number>;
  /** Relative popular-vote weight of each state (voter weight × turnout). */
  stateWeights: Record<StateCode, number>;
  /** Margin change (points) per +1 turnout point of each faction, per state. */
  turnoutSensitivity: Record<StateCode, FactionRecord<number>>;
  /** Turns until the election; 0 = election day. Widens uncertainty. */
  horizonTurns: number;
  config: MonteCarloConfig;
  /** Presidential years decide the White House (and the Senate VP tie-breaker). */
  kind: 'presidential' | 'midterm';
  /** Party holding the White House going in (VP tie-breaker in midterms). */
  incumbentParty: Party | null;
  /** Omit to simulate the presidency only. */
  congress?: CongressSimInput;
}

export interface CongressSimInput {
  /** House seats per state (all 435 are up every cycle). */
  houseSeats: Record<StateCode, number>;
  /** Senate seats up this cycle, with the party currently holding each. */
  senateRaces: { state: StateCode; holder: Party }[];
  /** Senate seats NOT up this cycle. */
  senateHoldovers: { player: number; opposition: number };
  seatModel: SeatModelConfig;
}

export interface ChamberSummary {
  mean: number;
  median: number;
  p5: number;
  p95: number;
  majorityProbability: number;
  histogram: number[];
}

export interface CongressResult {
  house: ChamberSummary;
  senate: ChamberSummary;
  /** P(player's party wins each Senate race up this cycle). */
  senateRaces: Record<string, { winProbability: number; holder: Party }>;
}

/** One EV-awarding unit: a state, a split state's at-large pair, or a congressional district. */
export interface ElectoralUnit {
  id: string;
  state: StateCode;
  region: RegionId;
  electoralVotes: number;
  /** Margin offset from the parent state (player perspective). 0 for whole states. */
  offset: number;
  isDistrict: boolean;
}

export interface StateSummary {
  winProbability: number;
  meanMargin: number;
  p5Margin: number;
  p95Margin: number;
}

export interface MonteCarloResult {
  seed: number;
  runs: number;
  winProbability: number;
  tieProbability: number;
  lossProbability: number;
  popularVoteWinProbability: number;
  /** P(electoral-college winner ≠ popular-vote winner). */
  splitProbability: number;
  electoralVotes: {
    mean: number;
    median: number;
    p5: number;
    p95: number;
    /** histogram[ev] = number of runs where the player won exactly `ev` EVs (length 539). */
    histogram: number[];
  };
  popularVote: { meanMargin: number; p5Margin: number; p95Margin: number };
  states: Record<StateCode, StateSummary>;
  /** ME/NE districts and at-large units. */
  districts: Record<string, { winProbability: number }>;
  /** Most frequent tipping-point units, descending. */
  tippingPoints: { unitId: string; probability: number }[];
  congress?: CongressResult;
}

/** Lightweight partial result for live progress updates. */
export interface MonteCarloSnapshot {
  completedRuns: number;
  totalRuns: number;
  winProbability: number;
  meanElectoralVotes: number;
  stateWinProbability: Record<StateCode, number>;
}
