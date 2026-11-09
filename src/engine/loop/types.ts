import type { CandidateWing, DepartmentId, DepartmentLevel, GamePhase, NationalMetrics, Party, PolicyVector, StateCode } from '@/domain/types';
import type { BillAnalysis } from '@/domain/schemas/billAnalysis.schema';
import type { Difficulty } from '@/data/balance.config';
import type { ElectorateMap, AppliedEffect } from '../types';
import type { CongressState } from '../legislature/types';
import type { BillOutcome } from '../legislature/passage';

/**
 * The complete, serializable game state. Every engine function takes one of
 * these and returns a new one. Nothing is mutated, and nothing depends on the
 * clock or Math.random, so a saved game replays bit-for-bit.
 */
export interface GameState {
  version: 1;
  seed: number;
  /** Current state of the game's RNG stream (see engine/rng.ts). */
  rngState: number;
  difficulty: Difficulty;

  player: {
    /** Current candidate / president. Changes at a successor handoff. */
    name: string;
    party: Party;
    /** Terms served by the CURRENT character (successor at 2). */
    termsServed: number;
    /** 0 = original character, 1 = first successor, … */
    generation: number;
    isPresident: boolean;
  };

  year: number;
  quarter: 1 | 2 | 3 | 4;
  /** Absolute turn index since the game began. */
  turn: number;
  phase: GamePhase;

  electorate: ElectorateMap;
  /** Per-state calibration (player perspective), including the difficulty shift. */
  calibration: Record<StateCode, number>;
  metrics: NationalMetrics;
  politicalCapital: number;
  playerPlatform: PolicyVector;
  oppositionPlatform: PolicyVector;
  congress: CongressState;
  /** Party in the White House. */
  incumbentParty: Party;

  /** Event id → turns since it last fired. */
  eventHistory: Record<string, number>;
  /** The crisis on the ticker this turn. */
  currentEventId: string;
  /** Bills and orders acted on this turn (written into the turn's log record at endTurn). */
  turnBills: BillLogEntry[];

  log: TurnRecord[];
  elections: ElectionRecord[];
  gameOver: { reason: 'lost_presidency' | 'lost_primary'; year: number } | null;

  campaign: CampaignState;

  /** The executive branch: budget levels, eliminations and directives in force. */
  departments: Record<DepartmentId, DepartmentState>;
  /** Who the player is up against in the current presidential cycle. */
  race: RaceState;
}

/** Bills, executive orders and budget requests each have their own quarterly limit. */
export type ActionKind = 'bill' | 'order' | 'budget';

export interface DepartmentState {
  level: DepartmentLevel;
  abolished: boolean;
  /** Id of the directive (executive order) currently in force, if any. */
  directive: string | null;
}

/** A presidential candidate: a real politician from the opening pools, or a generated one later. */
export interface Candidate {
  id: string;
  name: string;
  party: Party;
  home: StateCode;
  wing: CandidateWing;
  /** True for real politicians (the 2028–2036 pools). */
  real: boolean;
  /** 1–5. Debate and attack strength. */
  charisma: number;
  /** 1–5. Scales their ad spending. */
  fundraising: number;
  /** 1–5. High discipline blunts your attacks. */
  discipline: number;
}

export interface RaceState {
  /** The presidential election year this field is for. */
  cycle: number;
  /** The other party's front-runner, then nominee (from Q3 of the election year). */
  opponent: Candidate;
  nominated: boolean;
  /** The player's main primary rival, when the player has to win a primary. */
  rival: Candidate | null;
  /** Candidate ids already used, so nobody runs twice. */
  used: string[];
}

export interface CampaignState {
  /** Campaign money, $ millions. */
  funds: number;
  /** Campaign actions used this turn. */
  actionsUsed: number;
  /** Primary pledges made this turn (max 1). */
  pledgedThisTurn: boolean;
  /** Rallies held per state this cycle (diminishing returns). */
  rallies: Partial<Record<StateCode, number>>;
  /** Ad dollars ($M) spent per state this cycle (diminishing returns). */
  adSpend: Partial<Record<StateCode, number>>;
  /** Year of the last general-election debate held. */
  debateYear: number | null;
  primary: { year: number; share: number; won: boolean; candidate: string } | null;
  /** True once the player has named the current successor. */
  successorNamed: boolean;
  /** Recent campaign happenings, newest first. */
  recent: { turn: number; text: string }[];
  /** Strength of the opposition-research file on the opponent (0–3). */
  oppoFile: number;
  /** Recent negative campaigning. Raises backlash risk and dulls further attacks; decays each quarter. */
  negativity: number;
  /** A rapid-response team is on duty this quarter (halves the opposition's ads and attacks). */
  rapidResponse: boolean;
}

export interface TurnRecord {
  turn: number;
  year: number;
  quarter: number;
  phase: GamePhase;
  eventId: string;
  bills: BillLogEntry[];
  approval: number;
  metrics: NationalMetrics;
}

export interface BillLogEntry {
  title: string;
  kind?: ActionKind;
  outcome: BillOutcome['status'];
  capitalSpent: number;
}

export interface ElectionRecord {
  year: number;
  kind: 'presidential' | 'midterm';
  candidate: string;
  /** Presidential only. */
  playerEV?: number;
  won?: boolean;
  popularMargin: number;
  houseSeats: number;
  senateSeats: number;
  /** Player-perspective margins, for replaying the results map. */
  stateMargins: Record<StateCode, number>;
  /** EV-unit margins (states, ME/NE at-large and districts), so election night tallies exactly. */
  unitMargins?: Record<string, number>;
  /** Senate races decided this night. */
  senateResults?: { state: StateCode; winner: Party; previousHolder: Party }[];
}

export interface NewGameOptions {
  seed: number;
  playerName: string;
  party: Party;
  difficulty?: Difficulty;
}

export interface SubmitBillOptions {
  whipCapital?: number;
  reconciliation?: boolean;
  /** Which quarterly slot this uses. Defaults from the bill's instrument (order or bill). */
  kind?: ActionKind;
}

export interface SubmitBillResult {
  state: GameState;
  outcome: BillOutcome;
  capitalSpent: number;
  effects: AppliedEffect[];
}

export type BillRejection =
  | 'not_president'
  | 'wrong_phase'
  | 'bill_limit_reached'
  | 'order_limit_reached'
  | 'budget_limit_reached'
  | 'insufficient_capital'
  | 'game_over';

export type { BillAnalysis };
