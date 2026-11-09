import type {
  CANDIDATE_WINGS,
  DEPARTMENT_IDS,
  DEPARTMENT_LEVELS,
  COALITION_IDS,
  FACTION_IDS,
  GAME_PHASES,
  IMPACT_DIRECTIONS,
  IMPACT_MAGNITUDES,
  METRIC_IDS,
  PLAYABLE_PARTIES,
  POLICY_AXES,
  REGION_IDS,
  STATE_CODES,
  STATE_TAGS,
} from './constants';

export type FactionId = (typeof FACTION_IDS)[number];
export type CoalitionId = (typeof COALITION_IDS)[number];
export type Party = (typeof PLAYABLE_PARTIES)[number];
export type PolicyAxis = (typeof POLICY_AXES)[number];
export type MetricId = (typeof METRIC_IDS)[number];
export type StateCode = (typeof STATE_CODES)[number];
export type RegionId = (typeof REGION_IDS)[number];
export type StateTag = (typeof STATE_TAGS)[number];
export type GamePhase = (typeof GAME_PHASES)[number];
export type ImpactDirection = (typeof IMPACT_DIRECTIONS)[number];
export type ImpactMagnitude = (typeof IMPACT_MAGNITUDES)[number];

/** A full position in policy space. Every axis has a value. */
export type PolicyVector = Record<PolicyAxis, number>;

/** What a single bill touches. `null` = this bill says nothing about that axis. */
export type SparsePolicyVector = Record<PolicyAxis, number | null>;

export type FactionRecord<T> = Record<FactionId, T>;
export type CoalitionRecord<T> = Record<CoalitionId, T>;

export interface NationalMetrics {
  /** USD per gallon, national average. */
  gas_price: number;
  /** Core CPI, year-over-year %. */
  inflation: number;
  /** Trillions of USD. */
  national_debt: number;
  /** Southwest border encounters per month. */
  border_crossings: number;
  /** 0 (calm) – 100 (great-power war). */
  conflict_index: number;
}

/** Turn identifier, e.g. "2029-T04". */
export type TurnId = `${number}-T${string}`;

export type DepartmentId = (typeof DEPARTMENT_IDS)[number];
export type DepartmentLevel = (typeof DEPARTMENT_LEVELS)[number];
export type CandidateWing = (typeof CANDIDATE_WINGS)[number];
