import type { FactionId, PolicyAxis, StateTag } from '@/domain/types';
import type { BillFlag } from '@/domain/schemas/billAnalysis.schema';

/**
 * Every tunable coefficient in the game lives here. If you're rebalancing,
 * this is the only file you should need to touch.
 */

// ---------------------------------------------------------------------------
// Data-driven faction rules. Evaluated by the engine *after* applying the
// LLM's faction_modifiers, so they're deterministic and auditable.
// ---------------------------------------------------------------------------
export type RuleCondition =
  | { kind: 'flag'; flag: BillFlag; equals: boolean }
  | { kind: 'axis'; axis: PolicyAxis; op: 'lte' | 'gte'; value: number }
  | { kind: 'anyAxisAbsGte'; value: number }
  | { kind: 'all'; of: RuleCondition[] }
  | { kind: 'any'; of: RuleCondition[] };

export interface RuleEffect {
  faction: FactionId;
  satisfactionDelta: number;
  /** Additive change to turnout probability (e.g. +0.03 = +3 points). */
  turnoutDelta?: number;
  /** Apply only in states carrying this tag. Omit for nationwide. */
  stateTag?: StateTag;
}

export interface FactionRule {
  id: string;
  description: string;
  when: RuleCondition;
  effects: RuleEffect[];
}

export const FACTION_RULES: FactionRule[] = [
  {
    id: 'af_foreign_aid_blank_check',
    description: 'America First punishes open-ended foreign military aid with no domestic return.',
    when: {
      kind: 'all',
      of: [
        { kind: 'flag', flag: 'foreign_aid_blank_check', equals: true },
        { kind: 'flag', flag: 'domestic_roi_tangible', equals: false },
      ],
    },
    effects: [{ faction: 'r_america_first', satisfactionDelta: -8, turnoutDelta: -0.04 }],
  },
  {
    id: 'af_transactional_engagement',
    description: 'America First backs global action when it carries a tangible domestic ROI.',
    when: {
      kind: 'all',
      of: [
        { kind: 'flag', flag: 'domestic_roi_tangible', equals: true },
        { kind: 'axis', axis: 'foreign_policy', op: 'gte', value: 2 },
      ],
    },
    effects: [{ faction: 'r_america_first', satisfactionDelta: 3 }],
  },
  {
    id: 'progressive_suburban_ceiling',
    description:
      'Hard-left social/immigration agendas energize urban progressives but cost suburban independents and moderate Dems.',
    when: {
      kind: 'any',
      of: [
        { kind: 'axis', axis: 'social', op: 'lte', value: -7 },
        { kind: 'axis', axis: 'immigration', op: 'lte', value: -7 },
      ],
    },
    effects: [
      { faction: 'd_progressive', satisfactionDelta: 0, turnoutDelta: 0.05, stateTag: 'urban_core' },
      { faction: 'independent', satisfactionDelta: -5, stateTag: 'suburban_swing' },
      { faction: 'd_moderate', satisfactionDelta: -3, stateTag: 'suburban_swing' },
    ],
  },
  {
    // Symmetric guard: extremes on ANY axis, in either direction, cost swing voters.
    id: 'swing_voter_extremism_backlash',
    description: 'Any bill at the far end of an axis (|value| ≥ 9) alienates true independents.',
    when: { kind: 'anyAxisAbsGte', value: 9 },
    effects: [{ faction: 'independent', satisfactionDelta: -3 }],
  },
];

// ---------------------------------------------------------------------------
// Legislature
// ---------------------------------------------------------------------------
export const LEGISLATURE = {
  /** Political capital cost = base + perRadicalPoint × max(0, radical − freeThreshold). */
  capitalCost: { base: 5, perRadicalPoint: 6, freeThreshold: 3 },
  /** Executive orders skip Congress but still cost capital (this fraction of the bill cost). */
  executiveOrderCostFactor: 0.5,
  /** regen = base × (minFactor + approvalFactor × approval), approval in 0–1. */
  capitalRegen: { base: 12, minFactor: 0.4, approvalFactor: 1.2 },
  capitalMax: 100,
  /** Pass-probability penalty applied when programmatic score is below threshold. */
  programmaticPenalty: { threshold: 5, perPointBelow: 0.06 },

  /** Roll-call vote model: per-member P(yes). */
  vote: {
    partyLoyalty: 0.97,
    /** Own-party defection per radical point above `radicalComfort`. */
    radicalDefectionPerPoint: 0.035,
    radicalComfort: 4,
    oppositionCrossover: 0.04,
    /** Extra opposition crossover per point the bill is below `bipartisanCeiling` radicalism. */
    bipartisanBonusPerPoint: 0.05,
    bipartisanCeiling: 6,
    /** P(yes) shift per point of the party coalition's average LLM modifier (−10..+10). */
    coalitionMoodWeight: 0.012,
    /** Spending extra capital to whip: P(yes) gain per 10 capital (own party; half for opposition). */
    whipPer10Capital: 0.03,
    whipMaxCapital: 40,
  },
  /** Senate: 60 to break a filibuster; 51 via reconciliation (VP breaks a 50–50 tie). */
  thresholds: { house: 218, senate: 60, senateReconciliation: 51 },
  /** Court risk for executive orders, by flag. */
  courtStrikeRisk: { likely_court_challenge: 0.3, exceeds_executive_authority: 0.45 },
} as const;

// ---------------------------------------------------------------------------
// Seats (Stage 6)
// ---------------------------------------------------------------------------
export const SEAT_MODEL = {
  /** Within-state seat–vote exponent: s/(1−s) = (v/(1−v))^ρ. */
  houseRho: 2.6,
  /** National House-specific swing (split tickets), SD in margin points. */
  sigmaHouseNational: 1.0,
  /** Senate candidate-quality noise per race, SD in margin points. */
  sigmaSenateCandidate: 3.0,
  /** Incumbent-party bonus in Senate races, margin points. */
  senateIncumbency: 2.0,
  houseMajority: 218,
  senateMajority: 51,
} as const;

// ---------------------------------------------------------------------------
// Reactive opposition baseline (deterministic; no autonomous AI)
// ---------------------------------------------------------------------------
export const OPPOSITION = {
  /** How fast the player's platform moves toward each enacted bill (0–1). */
  platformLearningRate: 0.25,
  /** Axis values with |player| below this don't provoke a counter-shift. */
  salienceThreshold: 3,
  /** Max fraction of the way the opposition moves toward the mirror of the player. */
  mirrorStrength: 0.6,
  /** Fraction of the gap to target closed per turn (smooths whiplash). */
  inertia: 0.35,
  /** Opposition can't drift more than this from its party's natural anchor on any axis. */
  corridor: 7,
} as const;

// ---------------------------------------------------------------------------
// Monte Carlo error model (σ in percentage points of margin)
// ---------------------------------------------------------------------------
export const MONTE_CARLO = {
  /** Election-day polling error SDs, in points of margin. */
  sigmaNational: 2.5,
  sigmaRegional: 1.8,
  sigmaState: 2.2,
  /** Extra idiosyncratic error for ME/NE congressional districts. */
  sigmaDistrict: 1.5,
  /** National error is Student-t with this many degrees of freedom (fat tails, same SD). */
  nationalDf: 5,
  /** SD of a faction's national turnout surprise, in turnout points, per unit of elasticity. */
  sigmaTurnout: 3,
  /** Uncertainty multiplier = sqrt(1 + horizonGrowth × turns until election). */
  horizonGrowth: 0.25,
  defaultRuns: 10_000,
  /** Runs per chunk in the async runner (progress updates + cancellation points). */
  chunkSize: 500,
} as const;

export type MonteCarloConfig = typeof MONTE_CARLO;

// ---------------------------------------------------------------------------
// Vote choice (Stage 4). Satisfaction is always "satisfaction with the
// player's party/administration", 0–100, 50 = neutral.
//   utility = satisfaction·(sat−50)/50 + partisanship·lean_toward_player + proximity·advantage
//   P(vote player | votes major party) = sigmoid(utility)
// ---------------------------------------------------------------------------
export const VOTE_MODEL = {
  satisfactionWeight: 2.2,
  partisanshipWeight: 1.6,
  proximityWeight: 1.2,
  /** Share of each faction that votes third party regardless of the race. */
  thirdPartyRate: {
    r_america_first: 0.01,
    r_traditional_neocon: 0.01,
    r_establishment: 0.02,
    d_establishment: 0.01,
    d_progressive: 0.04,
    d_moderate: 0.01,
    independent: 0.05,
    libertarian_third: 0.3,
  } satisfies Record<FactionId, number>,
} as const;

export const TURNOUT = {
  /** Max turnout swing from (dis)satisfaction for a faction with elasticity 1. */
  enthusiasmSwing: 0.12,
  /** Midterm turnout = presidential turnout × this. */
  midtermFactor: 0.78,
  /** Extra midterm drop for factions whose home party holds the White House. */
  midtermIncumbentPenalty: 0.03,
  min: 0.2,
  max: 0.95,
} as const;

export const SATISFACTION = {
  /** Satisfaction points per LLM modifier point (LLM gives −10..+10). */
  modifierScale: 1.5,
  /** Fraction of the distance back to 50 recovered each turn (memory fades). */
  decayPerTurn: 0.06,
  /** Fraction of a rule's turnout shift that fades each turn. */
  turnoutShiftDecayPerTurn: 0.25,
} as const;

// ---------------------------------------------------------------------------
// National metrics (Stage 4). One turn ≈ one quarter.
// ---------------------------------------------------------------------------
export const METRIC_DRIFT = {
  /** Fraction of the gap to the long-run level closed each turn. */
  gas_price: { longRun: 3.3, reversion: 0.15 },
  inflation: { longRun: 2.5, reversion: 0.12 },
  border_crossings: { longRun: 18_000, reversion: 0.1 },
  conflict_index: { longRun: 40, reversion: 0.08 },
  /** Baseline structural deficit, trillions per turn. */
  national_debt: { deficitPerTurn: 0.5 },
} as const;

/**
 * How bad metrics pressure satisfaction with the incumbent each turn.
 * penalty = perUnit × max(0, value − comfort) × factionSensitivity
 */
export const METRIC_PRESSURE: Record<
  'gas_price' | 'inflation' | 'national_debt' | 'border_crossings' | 'conflict_index',
  { comfort: number; perUnit: number; sensitivity: Record<FactionId, number> }
> = {
  inflation: {
    comfort: 3,
    perUnit: 1.5,
    sensitivity: {
      r_america_first: 1.2, r_traditional_neocon: 1, r_establishment: 1, d_establishment: 0.8,
      d_progressive: 0.8, d_moderate: 1.1, independent: 1.3, libertarian_third: 1,
    },
  },
  gas_price: {
    comfort: 3.6,
    perUnit: 2,
    sensitivity: {
      r_america_first: 1.3, r_traditional_neocon: 0.8, r_establishment: 0.6, d_establishment: 0.6,
      d_progressive: 0.3, d_moderate: 1.2, independent: 1.2, libertarian_third: 0.8,
    },
  },
  border_crossings: {
    comfort: 30_000,
    perUnit: 1 / 20_000,
    sensitivity: {
      r_america_first: 1.6, r_traditional_neocon: 1, r_establishment: 0.6, d_establishment: 0.4,
      d_progressive: 0.1, d_moderate: 0.8, independent: 1, libertarian_third: 0.2,
    },
  },
  conflict_index: {
    comfort: 60,
    perUnit: 0.1,
    sensitivity: {
      r_america_first: 1, r_traditional_neocon: 1.2, r_establishment: 0.8, d_establishment: 0.8,
      d_progressive: 1, d_moderate: 0.8, independent: 1, libertarian_third: 1.2,
    },
  },
  national_debt: {
    /** At turn 0; rises with the structural deficit each turn (see debtComfort()). */
    comfort: 45,
    perUnit: 0.15,
    sensitivity: {
      r_america_first: 0.5, r_traditional_neocon: 1.2, r_establishment: 1.2, d_establishment: 0.4,
      d_progressive: 0.1, d_moderate: 0.8, independent: 0.7, libertarian_third: 1.5,
    },
  },
};

/** How strongly a bill's programmatic score scales its real-world effect: 1→0.55×, 10→1.0×. */
export const IMPLEMENTATION = { baseEffect: 0.5, perProgrammaticPoint: 0.05 } as const;

// ---------------------------------------------------------------------------
// Game loop (Stage 7). One turn = one quarter.
// ---------------------------------------------------------------------------
export const DIFFICULTY = {
  /** Authored map as-is (GOP Electoral College tilt included). */
  realistic: { label: 'Realistic', mode: 'none', offset: 0 },
  /** Uniform national shift so the tipping-point state starts at a dead heat. */
  balanced: { label: 'Balanced', mode: 'tipping_point', offset: 0 },
  /** Balanced, then the player starts 3 points behind nationally. */
  hard: { label: 'Hard', mode: 'tipping_point', offset: -3 },
} as const;
export type Difficulty = keyof typeof DIFFICULTY;

export const GAME_LOOP = {
  maxBillsPerTurn: 1,
  /** Executive orders and department budget requests have their own slots. */
  maxOrdersPerTurn: 2,
  maxBudgetRequestsPerTurn: 1,
  /** Capital granted at inauguration (honeymoon). */
  inaugurationCapital: 60,
  /** When the White House belongs to the other party, voters blame them for bad metrics:
   *  the player gains this fraction of the pressure instead of losing it. */
  challengerPressureShare: 0.5,
  /** How many turn records to keep in the save file. */
  logLimit: 200,
  /** Party holding the White House when the game opens (2028 is an open-seat race). */
  openingIncumbentParty: 'R',
} as const;
