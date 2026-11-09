import { GAME_LOOP, METRIC_PRESSURE } from '@/data/balance.config';
import { EVENTS } from '@/data/events';
import { MAX_PRESIDENTIAL_TERMS } from '@/domain/constants';
import { createRng } from '../rng';
import { applyBill, decayElectorate } from '../electorate/applyModifiers';
import { nationalApproval } from '../electorate/approval';
import { applyBillImpacts, applyMetricPressure, metricPressure, stepMetrics } from '../economy/metrics';
import { shockFaction } from '../electorate/applyModifiers';
import { advanceEventHistory, applyEvent, drawEvent } from '../events/eventTicker';
import { capitalCost, regenerateCapital, spendCapital } from '../legislature/politicalCapital';
import { resolveBill } from '../legislature/passage';
import { houseCounts, senateCounts } from '../legislature/seatModel';
import { stepOppositionPlatform, updatePlayerPlatform, computePartyAnchor, opposingParty } from '../opposition/reactiveBaseline';
import { FACTION_LIST } from '@/data/factions';
import { FACTION_IDS, STATE_CODES } from '@/domain/constants';
import { canLegislateIn, isElectionPhase, isPresidentialYear, nextQuarter, phaseFor } from './calendar';
import { resolveElectionTurn } from './election';
import { ensureRace, nominateOpponent } from '../campaign/race';
import { oppositionAdResponse, resetCampaignCycle, resetCampaignTurn, resolvePrimary } from '../campaign/campaign';
import type { ActionKind, BillAnalysis, BillRejection, GameState, SubmitBillOptions, SubmitBillResult, TurnRecord } from './types';

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------

const KIND_LIMITS: Record<ActionKind, number> = {
  bill: GAME_LOOP.maxBillsPerTurn,
  order: GAME_LOOP.maxOrdersPerTurn,
  budget: GAME_LOOP.maxBudgetRequestsPerTurn,
};
const LIMIT_REJECTION: Record<ActionKind, BillRejection> = {
  bill: 'bill_limit_reached',
  order: 'order_limit_reached',
  budget: 'budget_limit_reached',
};

/** Which quarterly slot an action uses: explicit, or from the instrument. */
export const actionKind = (bill: Pick<BillAnalysis, 'instrument'>, opts: SubmitBillOptions = {}): ActionKind =>
  opts.kind ?? (bill.instrument === 'executive_order' ? 'order' : 'bill');

/** How many of each slot are left this quarter. */
export function slotsLeft(state: GameState): Record<ActionKind, number> {
  const out = { ...KIND_LIMITS };
  for (const b of state.turnBills) out[b.kind ?? 'bill'] -= 1;
  return out;
}

/**
 * The same policy, signed as an executive order instead of sent to Congress.
 * Spending, taxes and sweeping changes are Congress's job, so the courts are
 * likely to strike those down.
 */
export function asExecutiveOrder(bill: BillAnalysis): BillAnalysis {
  if (bill.instrument === 'executive_order') return bill;
  const fiscal = bill.flags.deficit_financed || bill.flags.reconciliation_eligible;
  return {
    ...bill,
    instrument: 'executive_order',
    flags: {
      ...bill.flags,
      reconciliation_eligible: false,
      exceeds_executive_authority: bill.flags.exceeds_executive_authority || fiscal || bill.radical_score >= 7,
      likely_court_challenge: bill.flags.likely_court_challenge || bill.radical_score >= 5,
    },
  };
}

/** Why a bill can't be submitted right now, or null if it can. The UI disables the button with this. */
export function billRejection(state: GameState, bill: BillAnalysis, opts: SubmitBillOptions = {}): BillRejection | null {
  if (state.gameOver) return 'game_over';
  if (!state.player.isPresident) return 'not_president';
  if (!canLegislateIn(state.phase)) return 'wrong_phase';
  const kind = actionKind(bill, opts);
  const used = state.turnBills.filter((b) => (b.kind ?? 'bill') === kind).length;
  if (used >= KIND_LIMITS[kind]) return LIMIT_REJECTION[kind];
  if (state.politicalCapital < capitalCost(bill) + (opts.whipCapital ?? 0)) return 'insufficient_capital';
  return null;
}

/**
 * Spend capital, hold the vote (or sign the order), and, if it becomes law,
 * apply its effects to the electorate, the metrics and the player's platform.
 */
export function submitBill(state: GameState, bill: BillAnalysis, opts: SubmitBillOptions = {}): SubmitBillResult {
  const rejection = billRejection(state, bill, opts);
  if (rejection) throw new Error(`Bill rejected: ${rejection}`);

  const rng = createRng(state.rngState);
  const capitalSpent = capitalCost(bill) + (opts.whipCapital ?? 0);
  const party = state.player.party;
  const outcome = resolveBill(rng, bill, party, houseCounts(state.congress, party), senateCounts(state.congress, party), {
    whipCapital: opts.whipCapital ?? 0,
    reconciliation: opts.reconciliation ?? false,
    playerHoldsVP: state.incumbentParty === party,
  });

  let next: GameState = {
    ...state,
    rngState: rng.state,
    politicalCapital: spendCapital(state.politicalCapital, capitalSpent),
    turnBills: [...state.turnBills, { title: bill.title, kind: actionKind(bill, opts), outcome: outcome.status, capitalSpent }],
  };

  let effects: SubmitBillResult['effects'] = [];
  if (outcome.status === 'enacted' || outcome.status === 'executive_order_upheld') {
    const applied = applyBill(next.electorate, bill);
    effects = applied.effects;
    next = {
      ...next,
      electorate: applied.electorate,
      metrics: applyBillImpacts(next.metrics, bill),
      playerPlatform: updatePlayerPlatform(next.playerPlatform, bill),
    };
  }

  return { state: next, outcome, capitalSpent, effects };
}

// ---------------------------------------------------------------------------
// End of turn
// ---------------------------------------------------------------------------

/**
 * Ends the current turn:
 *   1. election night (if this is an election turn)
 *   2. opposition reacts · metric pressure · drift · decay · capital regen
 *   3. advance the calendar (+ 22nd Amendment successor handoff)
 *   4. draw and apply NEXT turn's event, so the player sees the crisis while drafting
 */
export function endTurn(state: GameState): GameState {
  if (state.gameOver) return state;
  const rng = createRng(state.rngState);
  let s: GameState = { ...state };

  // 1. Election night (then a fresh campaign cycle) or the end of primary season
  if (isElectionPhase(s.phase)) {
    s = resolveElectionTurn(s, rng).state;
    s = { ...s, campaign: resetCampaignCycle(s.campaign) };
    if (s.gameOver) return { ...s, rngState: rng.state, turnBills: [], log: appendLog(s.log, turnRecordBase(s)) };
  } else if (s.phase === 'primary' && s.quarter === 2) {
    s = resolvePrimary(s, rng);
    if (s.gameOver) return { ...s, rngState: rng.state, turnBills: [], log: appendLog(s.log, turnRecordBase(s)) };
  }

  // The opposition campaigns too: ads in the closest states.
  s = oppositionAdResponse(s);

  // 2. The world responds
  const oppAnchor = computePartyAnchor(opposingParty(s.player.party), FACTION_LIST);
  s.oppositionPlatform = stepOppositionPlatform(s.oppositionPlatform, s.playerPlatform, oppAnchor);
  s.electorate = applyIncumbencyPressure(s);
  s.metrics = stepMetrics(s.metrics);
  s.electorate = decayElectorate(s.electorate);
  if (s.player.isPresident) s.politicalCapital = regenerateCapital(s.politicalCapital, nationalApproval(s.electorate));

  // Record the turn that just ended, including any bills acted on.
  const ended = turnRecordBase({ ...s, turn: state.turn, year: state.year, quarter: state.quarter, phase: state.phase });

  // 3. Calendar
  const { year, quarter } = nextQuarter(s.year, s.quarter);
  s = { ...s, year, quarter, turn: s.turn + 1, turnBills: [], campaign: resetCampaignTurn(s.campaign) };
  s = maybeHandOffToSuccessor(s);
  s.phase = phaseFor(year, quarter, s.player.isPresident);
  s = ensureRace(s);
  if (s.phase === 'general_campaign' && !s.race.nominated && s.race.cycle === s.year) s = nominateOpponent(s);

  // 4. Next turn's event
  const event = drawEvent(rng, s.metrics, s.eventHistory);
  const hit = applyEvent(event, s.metrics, s.electorate, blameFactor(s));
  s = {
    ...s,
    metrics: hit.metrics,
    electorate: hit.electorate,
    eventHistory: advanceEventHistory(s.eventHistory, event.id),
    currentEventId: event.id,
    rngState: rng.state,
  };
  return { ...s, log: appendLog(s.log, ended) };
}

/** 1 if the player holds the White House; −challengerPressureShare if the other party does. */
export const blameFactor = (s: Pick<GameState, 'incumbentParty' | 'player'>) =>
  s.incumbentParty === s.player.party ? 1 : -GAME_LOOP.challengerPressureShare;

/**
 * Voters blame the White House. If the player holds it, metric pressure hurts
 * them. If the other party does, the player gains a fraction of it.
 */
function applyIncumbencyPressure(s: GameState) {
  if (s.incumbentParty === s.player.party) return applyMetricPressure(s.electorate, s.metrics, s.turn).electorate;
  const pressure = metricPressure(s.metrics, METRIC_PRESSURE, { turn: s.turn });
  let map = s.electorate;
  for (const f of FACTION_IDS) {
    if (pressure[f] !== 0) map = shockFaction(map, f, STATE_CODES, -pressure[f] * GAME_LOOP.challengerPressureShare);
  }
  return map;
}

/** At the start of a presidential year after two terms, the party's torch passes to a successor. */
function maybeHandOffToSuccessor(s: GameState): GameState {
  if (!(isPresidentialYear(s.year) && s.quarter === 1)) return s;
  if (!(s.player.isPresident && s.player.termsServed >= MAX_PRESIDENTIAL_TERMS)) return s;
  const generation = s.player.generation + 1;
  return {
    ...s,
    player: {
      ...s.player,
      name: successorName(s.player.name, generation),
      termsServed: 0,
      generation,
      isPresident: false,
    },
    // The player names the successor from the campaign panel (until then, a placeholder).
    campaign: { ...s.campaign, successorNamed: false },
  };
}

/** Placeholder name until the player names the successor (campaign action 'name_successor'). */
export const successorName = (original: string, generation: number) =>
  `${original.replace(/ \(Successor \d+\)$/, '')} (Successor ${generation})`;

// ---------------------------------------------------------------------------
// Log helpers
// ---------------------------------------------------------------------------

function turnRecordBase(s: GameState): TurnRecord {
  return {
    turn: s.turn,
    year: s.year,
    quarter: s.quarter,
    phase: s.phase,
    eventId: s.currentEventId,
    bills: s.turnBills,
    approval: nationalApproval(s.electorate),
    metrics: s.metrics,
  };
}

function appendLog(log: TurnRecord[], rec: TurnRecord): TurnRecord[] {
  const next = [...log, rec];
  return next.length > GAME_LOOP.logLimit ? next.slice(next.length - GAME_LOOP.logLimit) : next;
}

export const currentEvent = (s: GameState) => EVENTS.find((e) => e.id === s.currentEventId)!;
