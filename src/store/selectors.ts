import { nationalApproval, nationalFactionSatisfaction } from '@/engine/electorate/approval';
import { currentEvent, billRejection } from '@/engine/loop/actions';
import { houseCounts, senateCounts } from '@/engine/legislature/seatModel';
import { turnsUntilElection } from '@/engine/loop/calendar';
import { sumByCoalition, weightedMeanByCoalition } from '@/domain/coalitions';
import { FACTION_LIST } from '@/data/factions';
import { FACTION_IDS, STATE_CODES } from '@/domain/constants';
import { applyBill } from '@/engine/electorate/applyModifiers';
import { updatePlayerPlatform } from '@/engine/opposition/reactiveBaseline';
import type { FactionId, FactionRecord, StateCode } from '@/domain/types';
import { nationalVote, stateVote } from '@/engine/electorate/voteShare';
import { electionContext } from '@/engine/loop/forecast';
import type { BillAnalysis, GameState } from '@/engine/loop/types';

/**
 * Pure derived views of GameState. Components call these on `game` rather
 * than storing derived data, so the state stays the single source of truth.
 */
export const selectApproval = (g: GameState) => nationalApproval(g.electorate);

export const selectCongress = (g: GameState) => ({
  house: houseCounts(g.congress, g.player.party),
  senate: senateCounts(g.congress, g.player.party),
});

export const selectCurrentEvent = (g: GameState) => currentEvent(g);

export const selectTurnsUntilElection = (g: GameState) => turnsUntilElection(g.year, g.quarter);

export const selectBillRejection = (g: GameState, bill: BillAnalysis) => billRejection(g, bill);

const NATIONAL_WEIGHTS = Object.fromEntries(FACTION_LIST.map((f) => [f.id, f.nationalWeight])) as FactionRecord<number>;

/** 3-bucket satisfaction for the dashboard; each bucket expands to its factions. */
export const selectCoalitionSatisfaction = (g: GameState) =>
  weightedMeanByCoalition(nationalFactionSatisfaction(g.electorate), NATIONAL_WEIGHTS);

export const selectCoalitionSize = () => sumByCoalition(NATIONAL_WEIGHTS);

// ---------------------------------------------------------------------------
// Map / state drawer
// ---------------------------------------------------------------------------

export interface FactionRow {
  faction: FactionId;
  /** Share of the state's electorate. */
  share: number;
  satisfaction: number;
  turnout: number;
  /** Share of this faction's votes going to the player. */
  playerVoteShare: number;
}

/** "If the election were held today" for one state: margin, turnout and the 8-faction breakdown. */
export function selectStateDetail(g: GameState, state: StateCode) {
  const r = stateVote(state, g.electorate[state], electionContext(g), g.calibration[state]);
  const factions: FactionRow[] = FACTION_IDS.map((f) => {
    const v = r.byFaction[f];
    const cast = v.player + v.opposition + v.third;
    return {
      faction: f,
      share: g.electorate[state][f].weight,
      satisfaction: g.electorate[state][f].satisfaction,
      turnout: v.turnout,
      playerVoteShare: cast > 0 ? v.player / cast : 0,
    };
  });
  return { margin: r.margin, turnout: r.turnout, thirdShare: r.thirdShare, factions };
}

/** National satisfaction of one faction in every state (faction lens on the map). */
export const selectFactionByState = (g: GameState, faction: FactionId) =>
  Object.fromEntries(Object.entries(g.electorate).map(([s, e]) => [s, e[faction].satisfaction])) as Record<StateCode, number>;

// ---------------------------------------------------------------------------
// Bill drafting: projected impact before the vote
// ---------------------------------------------------------------------------

export interface BillImpactPreview {
  /** Change in the national popular-vote margin (points), if it became law today. */
  marginDelta: number;
  /** Change in approval (0–1 scale). */
  approvalDelta: number;
  /** Change in each faction's national satisfaction (points). */
  factionDeltas: FactionRecord<number>;
  /** Faction rules from balance.config that this bill would trigger. */
  rulesTriggered: string[];
}

/**
 * "If this passed today": applies the bill to a copy of the electorate and the
 * player's platform, then re-runs the national vote. It shows the immediate
 * effect only, before the opposition responds and before metrics move.
 */
export function selectBillImpactPreview(g: GameState, bill: BillAnalysis): BillImpactPreview {
  const ctx = electionContext(g);
  const vote = (electorate: GameState['electorate'], c: typeof ctx) =>
    nationalVote(STATE_CODES.map((s) => stateVote(s, electorate[s], c, g.calibration[s]))).margin;

  const applied = applyBill(g.electorate, bill);
  const after = { ...ctx, playerPlatform: updatePlayerPlatform(g.playerPlatform, bill) };
  const before = nationalFactionSatisfaction(g.electorate);
  const next = nationalFactionSatisfaction(applied.electorate);

  return {
    marginDelta: vote(applied.electorate, after) - vote(g.electorate, ctx),
    approvalDelta: nationalApproval(applied.electorate) - nationalApproval(g.electorate),
    factionDeltas: Object.fromEntries(FACTION_IDS.map((f) => [f, next[f] - before[f]])) as FactionRecord<number>,
    rulesTriggered: [...new Set(applied.effects.filter((e) => e.source === 'rule').map((e) => e.sourceId))],
  };
}
