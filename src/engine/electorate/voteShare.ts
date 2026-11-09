import { FACTION_IDS, STATE_CODES } from '@/domain/constants';
import type { FactionId, FactionRecord, Party, StateCode } from '@/domain/types';
import { FACTIONS, FACTION_LIST } from '@/data/factions';
import { STATES } from '@/data/states';
import { VOTE_MODEL } from '@/data/balance.config';
import type { StateElectorate } from '@/data/derive/stateElectorate';
import { computePartyAnchor, opposingParty } from '../opposition/reactiveBaseline';
import type { ElectionContext, ElectorateMap } from '../types';
import { factionTurnout } from './turnout';
import { proximityAdvantage } from './proximity';

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));
const partySign = (p: Party) => (p === 'R' ? 1 : -1);

/** P(vote for the player | votes for a major party). */
export function playerVoteProbability(faction: FactionId, satisfaction: number, ctx: ElectionContext, cfg = VOTE_MODEL) {
  const def = FACTIONS[faction];
  const leanTowardPlayer = partySign(ctx.playerParty) * def.partyLean;
  const utility =
    cfg.satisfactionWeight * ((satisfaction - 50) / 50) +
    cfg.partisanshipWeight * leanTowardPlayer +
    cfg.proximityWeight * proximityAdvantage(def, ctx.playerPlatform, ctx.oppositionPlatform) * 4;
  return sigmoid(utility);
}

export interface FactionVote {
  turnout: number;
  /** Shares of this state's eligible electorate. */
  player: number;
  opposition: number;
  third: number;
}

export interface StateResult {
  state: StateCode;
  /** Shares of votes cast, summing to 1. */
  playerShare: number;
  oppositionShare: number;
  thirdShare: number;
  /** Player − opposition, in percentage points, BEFORE calibration. */
  rawMargin: number;
  /** Calibrated margin in percentage points (player perspective). The number the map shows. */
  margin: number;
  turnout: number;
  byFaction: FactionRecord<FactionVote>;
}

/**
 * Vote intention for one state: Σ faction weight × turnout × P(vote).
 * `calibration` is a per-state constant (see calibrateStates).
 */
export function stateVote(
  state: StateCode,
  electorate: StateElectorate,
  ctx: ElectionContext,
  calibration = 0,
  cfg = VOTE_MODEL,
): StateResult {
  const byFaction = {} as FactionRecord<FactionVote>;
  let player = 0;
  let opposition = 0;
  let third = 0;
  let turnoutTotal = 0;

  for (const f of FACTION_IDS) {
    const e = electorate[f];
    const turnout = factionTurnout(f, e, ctx);
    const voters = e.weight * turnout;
    const thirdRate = cfg.thirdPartyRate[f];
    const pPlayer = playerVoteProbability(f, e.satisfaction, ctx, cfg);
    const v: FactionVote = {
      turnout,
      third: voters * thirdRate,
      player: voters * (1 - thirdRate) * pPlayer,
      opposition: voters * (1 - thirdRate) * (1 - pPlayer),
    };
    byFaction[f] = v;
    player += v.player;
    opposition += v.opposition;
    third += v.third;
    turnoutTotal += voters;
  }

  const cast = player + opposition + third;
  const rawMargin = ((player - opposition) / cast) * 100;
  return {
    state,
    playerShare: player / cast,
    oppositionShare: opposition / cast,
    thirdShare: third / cast,
    rawMargin,
    margin: rawMargin + calibration,
    turnout: turnoutTotal,
    byFaction,
  };
}

/**
 * Per-state calibration constants so that, at the neutral starting point
 * (satisfaction 50, both parties at their natural anchors), every state's
 * margin equals its authored partisan lean. The model then drives *changes*
 * from that baseline. This keeps the opening map faithful to the data while
 * the faction math stays simple and readable.
 */
export function calibrateStates(electorates: ElectorateMap, playerParty: Party): Record<StateCode, number> {
  const neutralCtx: ElectionContext = {
    playerParty,
    playerPlatform: computePartyAnchor(playerParty, FACTION_LIST),
    oppositionPlatform: computePartyAnchor(opposingParty(playerParty), FACTION_LIST),
    isMidterm: false,
    incumbentParty: null,
  };
  const neutral = Object.fromEntries(
    STATE_CODES.map((s) => [s, withNeutralSatisfaction(electorates[s])]),
  ) as ElectorateMap;

  const out = {} as Record<StateCode, number>;
  for (const s of STATE_CODES) {
    // lean > 0 means GOP, so the player's target margin is lean × (+1 for R, −1 for D).
    const targetPlayerMargin = partySign(playerParty) * STATES[s].lean;
    out[s] = targetPlayerMargin - stateVote(s, neutral[s], neutralCtx).rawMargin;
  }
  return out;
}

function withNeutralSatisfaction(e: StateElectorate): StateElectorate {
  const out = {} as StateElectorate;
  for (const f of FACTION_IDS) out[f] = { ...e[f], satisfaction: 50, turnoutShift: 0 };
  return out;
}

/** Relative size of each state's electorate (House seats ≈ population; DC ≈ 0.9 seat). */
export const stateVoterWeight = (s: StateCode) => (s === 'DC' ? 0.9 : STATES[s].houseSeats);

export interface NationalResult {
  playerShare: number;
  oppositionShare: number;
  thirdShare: number;
  /** Popular-vote margin, player perspective, percentage points. */
  margin: number;
}

/** National popular vote: turnout-weighted aggregation of calibrated state results. */
export function nationalVote(results: readonly StateResult[]): NationalResult {
  let player = 0;
  let opposition = 0;
  let third = 0;
  for (const r of results) {
    const w = stateVoterWeight(r.state) * r.turnout;
    // Apply calibration by shifting the two-party split by margin/2 each way.
    const shift = (r.margin - r.rawMargin) / 200;
    player += w * (r.playerShare + shift);
    opposition += w * (r.oppositionShare - shift);
    third += w * r.thirdShare;
  }
  const total = player + opposition + third;
  return {
    playerShare: player / total,
    oppositionShare: opposition / total,
    thirdShare: third / total,
    margin: ((player - opposition) / total) * 100,
  };
}
