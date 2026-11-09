import { FACTION_IDS, POLICY_AXES, STATE_CODES } from '@/domain/constants';
import type { FactionId, GamePhase, PolicyAxis, SparsePolicyVector, StateCode } from '@/domain/types';
import { FACTIONS } from '@/data/factions';
import { STATES } from '@/data/states';
import {
  CAMPAIGN,
  DEBATE_EFFECTS,
  DEBATE_TOPICS,
  PRIMARY_WEIGHTS,
  WINGS,
  type DebateStyle,
} from '@/data/campaign';
import { clamp } from '@/lib/math';
import { createRng, hashString, type Rng } from '../rng';
import { shockFaction } from '../electorate/applyModifiers';
import { nationalApproval, nationalFactionSatisfaction } from '../electorate/approval';
import { stateVote } from '../electorate/voteShare';
import { updatePlayerPlatform } from '../opposition/reactiveBaseline';
import { electionContext } from '../loop/forecast';
import { RACE } from '@/data/candidates';
import {
  attackEffectiveness,
  attackTarget,
  backlashChance,
  opponentAttackSize,
  opponentFactions,
  oppositionAdScale,
  recordAttackGain,
  weakestAxis,
} from './race';
import type { CampaignState, GameState } from '../loop/types';
import type { ElectorateMap } from '../types';

/**
 * Campaign actions. Like bills, each is a pure function GameState → GameState
 * with a plain-English result, and each can be refused with a reason the UI shows.
 */

export type CampaignAction =
  | { type: 'fundraise' }
  | { type: 'rally'; state: StateCode }
  | { type: 'ad'; state: StateCode; amount: number; tone?: 'positive' | 'negative' }
  | { type: 'attack_record'; axis: PolicyAxis }
  | { type: 'oppo_research' }
  | { type: 'release_oppo' }
  | { type: 'rapid_response' }
  | { type: 'pledge'; faction: FactionId }
  | { type: 'debate'; answers: { topic: string; style: DebateStyle }[] }
  | { type: 'name_successor'; name: string };

export type CampaignRejection =
  | 'game_over'
  | 'not_campaign_season'
  | 'no_actions_left'
  | 'insufficient_funds'
  | 'invalid_amount'
  | 'not_primary'
  | 'already_pledged'
  | 'not_own_faction'
  | 'no_debate_now'
  | 'invalid_answers'
  | 'no_successor_to_name'
  | 'invalid_name'
  | 'no_file'
  | 'file_full'
  | 'already_responding';

export const defaultCampaign = (): CampaignState => ({
  funds: CAMPAIGN.startingFunds,
  actionsUsed: 0,
  pledgedThisTurn: false,
  rallies: {},
  adSpend: {},
  debateYear: null,
  primary: null,
  successorNamed: true,
  recent: [],
  oppoFile: 0,
  negativity: 0,
  rapidResponse: false,
});

const CAMPAIGN_PHASES = new Set<GamePhase>(['primary', 'general_campaign', 'midterm_campaign']);
export const isCampaignPhase = (p: GamePhase) => CAMPAIGN_PHASES.has(p);
const COSTS_ACTION = new Set<CampaignAction['type']>(['fundraise', 'rally', 'ad', 'attack_record', 'oppo_research', 'release_oppo', 'rapid_response']);

/** The debate happens once, in Q3 of a presidential year. */
export const debateAvailable = (g: GameState) =>
  g.phase === 'general_campaign' && g.year % 4 === 0 && g.campaign.debateYear !== g.year;

/** Three topics for this year's debate, chosen deterministically from the game seed and year. */
export function debateTopics(g: GameState) {
  const rng = createRng(hashString(`debate:${g.seed}:${g.year}`));
  const pool = [...DEBATE_TOPICS];
  const out = [];
  for (let i = 0; i < 3; i++) out.push(pool.splice(rng.int(0, pool.length - 1), 1)[0]!);
  return out;
}

/** $M a fundraiser would raise right now. */
export function fundraiseAmount(g: GameState): number {
  const donors = nationalFactionSatisfaction(g.electorate)[WINGS[g.player.party].moderate];
  const donorMood = clamp(donors / 50, 0.5, 1.5);
  return Math.round(CAMPAIGN.fundraise.base * (0.6 + 0.8 * nationalApproval(g.electorate)) * donorMood);
}

/** Persuasion points an ad buy would deliver in a state, given what was already spent there. */
export function adEffect(g: GameState, state: StateCode, amount: number): number {
  const seats = Math.max(1, STATES[state].houseSeats);
  const unit = CAMPAIGN.ads.costPerSeat * seats;
  const before = g.campaign.adSpend[state] ?? 0;
  const gain = CAMPAIGN.ads.pointsPerSqrtUnit * (Math.sqrt((before + amount) / unit) - Math.sqrt(before / unit));
  return Math.min(CAMPAIGN.ads.maxPerBuy, gain);
}

/** Rally multiplier: 1, ½, ⅓… for repeat visits this cycle. */
export const rallyFactor = (g: GameState, state: StateCode) => 1 / (1 + (g.campaign.rallies[state] ?? 0));

export function campaignRejection(g: GameState, a: CampaignAction): CampaignRejection | null {
  if (g.gameOver) return 'game_over';
  if (a.type === 'name_successor') {
    if (g.campaign.successorNamed || g.player.generation === 0) return 'no_successor_to_name';
    const n = a.name.trim();
    return n.length < 2 || n.length > 40 ? 'invalid_name' : null;
  }
  if (!isCampaignPhase(g.phase)) return 'not_campaign_season';
  if (COSTS_ACTION.has(a.type) && g.campaign.actionsUsed >= CAMPAIGN.actionsPerTurn) return 'no_actions_left';
  switch (a.type) {
    case 'ad':
      if (!(a.amount >= CAMPAIGN.ads.minBuy && a.amount <= CAMPAIGN.ads.maxBuy)) return 'invalid_amount';
      return a.amount > g.campaign.funds ? 'insufficient_funds' : null;
    case 'attack_record':
      return RACE.record.cost > g.campaign.funds ? 'insufficient_funds' : null;
    case 'oppo_research':
      if (g.campaign.oppoFile >= RACE.research.maxFile) return 'file_full';
      return RACE.research.cost > g.campaign.funds ? 'insufficient_funds' : null;
    case 'release_oppo':
      return g.campaign.oppoFile > 0 ? null : 'no_file';
    case 'rapid_response':
      return g.campaign.rapidResponse ? 'already_responding' : null;
    case 'pledge':
      if (g.phase !== 'primary') return 'not_primary';
      if (g.campaign.pledgedThisTurn) return 'already_pledged';
      return FACTIONS[a.faction].homeParty === g.player.party ? null : 'not_own_faction';
    case 'debate': {
      if (!debateAvailable(g)) return 'no_debate_now';
      const ids = debateTopics(g).map((t) => t.id);
      const ok = a.answers.length === 3 && a.answers.every((x) => ids.includes(x.topic)) && new Set(a.answers.map((x) => x.topic)).size === 3;
      return ok ? null : 'invalid_answers';
    }
    default:
      return null;
  }
}

const note = (g: GameState, text: string): CampaignState['recent'] => [{ turn: g.turn, text }, ...g.campaign.recent].slice(0, 8);
const homeFactions = (g: GameState) => FACTION_IDS.filter((f) => FACTIONS[f].homeParty === g.player.party);

export interface CampaignResult {
  state: GameState;
  message: string;
}

/** Applies a campaign action. Throws if it is not allowed (the UI checks campaignRejection first). */
export function performCampaignAction(g: GameState, a: CampaignAction): CampaignResult {
  const why = campaignRejection(g, a);
  if (why) throw new Error(`Campaign action refused: ${why}`);
  const spent = COSTS_ACTION.has(a.type) ? 1 : 0;
  const base: GameState = { ...g, campaign: { ...g.campaign, actionsUsed: g.campaign.actionsUsed + spent } };
  const wings = WINGS[g.player.party];
  let electorate: ElectorateMap = base.electorate;
  let message: string;

  switch (a.type) {
    case 'fundraise': {
      const raised = fundraiseAmount(g);
      electorate = shockFaction(electorate, wings.moderate, STATE_CODES, CAMPAIGN.fundraise.establishmentDelta);
      electorate = shockFaction(electorate, wings.base, STATE_CODES, CAMPAIGN.fundraise.baseDelta);
      message = `Raised $${raised}M from donors. The ${FACTIONS[wings.moderate].label} wing is pleased; the ${FACTIONS[wings.base].label} wing noticed.`;
      const funds = Math.min(CAMPAIGN.maxFunds, g.campaign.funds + raised);
      return { state: { ...base, electorate, campaign: { ...base.campaign, funds, recent: note(g, message) } }, message };
    }
    case 'rally': {
      const k = rallyFactor(g, a.state);
      for (const f of homeFactions(g)) {
        electorate = shockFaction(electorate, f, [a.state], CAMPAIGN.rally.homeSatisfaction * k, CAMPAIGN.rally.turnout * k);
      }
      electorate = shockFaction(electorate, 'independent', [a.state], CAMPAIGN.rally.independentSatisfaction * k);
      electorate = shockFaction(electorate, 'independent', STATE_CODES, CAMPAIGN.rally.nationalIndependentSatisfaction);
      message = `Rallied in ${STATES[a.state].name}${k < 1 ? ' again, to a smaller crowd' : ''}: your base there is fired up.`;
      const rallies = { ...g.campaign.rallies, [a.state]: (g.campaign.rallies[a.state] ?? 0) + 1 };
      return { state: { ...base, electorate, campaign: { ...base.campaign, rallies, recent: note(g, message) } }, message };
    }
    case 'ad': {
      const pts = adEffect(g, a.state, a.amount);
      const adSpend = { ...g.campaign.adSpend, [a.state]: (g.campaign.adSpend[a.state] ?? 0) + a.amount };
      const theirModerate = WINGS[g.player.party === 'R' ? 'D' : 'R'].moderate;
      const funds = g.campaign.funds - a.amount;
      if (a.tone === 'negative') {
        // Attack ads: less persuasion, but they depress the other side's turnout. Risk of backlash.
        const N = RACE.negativeAd;
        const p = pts * N.persuasionShare * attackEffectiveness(g);
        electorate = shockFaction(electorate, 'independent', [a.state], p);
        electorate = shockFaction(electorate, theirModerate, [a.state], p * 0.6);
        for (const f of opponentFactions(g)) electorate = shockFaction(electorate, f, [a.state], 0, -N.turnoutPerPoint * pts);
        const attacked = withBacklash({ ...base, electorate }, 0.5, `Ran $${a.amount}M of attack ads against ${attackTarget(g)} in ${STATES[a.state].name}`);
        const st = attacked.state;
        return {
          state: { ...st, campaign: { ...st.campaign, funds, adSpend, negativity: st.campaign.negativity + N.negativity, recent: note(g, attacked.message) } },
          message: attacked.message,
        };
      }
      electorate = shockFaction(electorate, 'independent', [a.state], pts);
      electorate = shockFaction(electorate, wings.moderate, [a.state], pts * 0.6);
      electorate = shockFaction(electorate, theirModerate, [a.state], pts * 0.4);
      message = `Spent $${a.amount}M on ads in ${STATES[a.state].name}: persuadable voters moved ${pts.toFixed(1)} points your way.`;
      return {
        state: { ...base, electorate, campaign: { ...base.campaign, funds, adSpend, recent: note(g, message) } },
        message,
      };
    }
    case 'attack_record': {
      const gain = recordAttackGain(g, a.axis);
      const theirModerate = WINGS[g.player.party === 'R' ? 'D' : 'R'].moderate;
      electorate = shockFaction(electorate, 'independent', STATE_CODES, gain);
      electorate = shockFaction(electorate, theirModerate, STATE_CODES, gain * RACE.record.theirModerateShare);
      const topic = AXIS_TOPIC[a.axis];
      const lead =
        gain > 0.3
          ? `Your campaign hit ${attackTarget(g)} on ${topic}. It landed: independents moved ${gain.toFixed(1)} points your way`
          : gain >= 0
            ? `Your campaign hit ${attackTarget(g)} on ${topic}. It barely registered`
            : `Your campaign hit ${attackTarget(g)} on ${topic}, and it backfired: your own record there is easier to attack`;
      const attacked = withBacklash({ ...base, electorate }, 1, lead);
      const st = attacked.state;
      return {
        state: { ...st, campaign: { ...st.campaign, funds: st.campaign.funds - RACE.record.cost, negativity: st.campaign.negativity + 1, recent: note(g, attacked.message) } },
        message: attacked.message,
      };
    }
    case 'oppo_research': {
      const rng = createRng(g.rngState);
      const found = Math.min(RACE.research.maxFile - g.campaign.oppoFile, 1 + (rng.next() < 0.5 ? 1 : 0));
      const oppoFile = g.campaign.oppoFile + found;
      message = `Researchers spent $${RACE.research.cost}M combing through ${attackTarget(g)}’s public record. The file is ${FILE_LABEL[oppoFile]}.`;
      return {
        state: { ...base, rngState: rng.state, campaign: { ...base.campaign, funds: g.campaign.funds - RACE.research.cost, oppoFile, recent: note(g, message) } },
        message,
      };
    }
    case 'release_oppo': {
      const R = RACE.release;
      const file = g.campaign.oppoFile;
      const gain = R.perPoint * file * attackEffectiveness(g);
      electorate = shockFaction(electorate, 'independent', STATE_CODES, gain);
      for (const f of opponentFactions(g)) electorate = shockFaction(electorate, f, STATE_CODES, 0, -R.turnoutPerPoint * file);
      const attacked = withBacklash(
        { ...base, electorate },
        0.5,
        `You released your research on ${attackTarget(g)}. Their record dominated the news cycle: independents moved ${gain.toFixed(1)} points and their base looks deflated`,
      );
      const st = attacked.state;
      return {
        state: { ...st, campaign: { ...st.campaign, oppoFile: 0, negativity: st.campaign.negativity + 1, recent: note(g, attacked.message) } },
        message: attacked.message,
      };
    }
    case 'rapid_response': {
      message = 'A rapid-response team is on duty this quarter: the opposition’s ads and attacks will land with half the force.';
      return { state: { ...base, campaign: { ...base.campaign, rapidResponse: true, recent: note(g, message) } }, message };
    }
    case 'pledge': {
      const wing = a.faction;
      for (const f of homeFactions(g)) {
        electorate =
          f === wing
            ? shockFaction(electorate, f, STATE_CODES, CAMPAIGN.pledge.wingSatisfaction, CAMPAIGN.pledge.wingTurnout)
            : shockFaction(electorate, f, STATE_CODES, CAMPAIGN.pledge.otherWingsDelta);
      }
      const ideal = FACTIONS[wing].idealPoint;
      const pull = Object.fromEntries(POLICY_AXES.map((ax) => [ax, ideal[ax]])) as SparsePolicyVector;
      const playerPlatform = updatePlayerPlatform(g.playerPlatform, { policy_vector: pull, radical_score: CAMPAIGN.pledge.platformRadicalism });
      message = `Pledged to the ${FACTIONS[wing].label} wing. They are with you, and your platform moved their way.`;
      return {
        state: { ...base, electorate, playerPlatform, campaign: { ...base.campaign, pledgedThisTurn: true, recent: note(g, message) } },
        message,
      };
    }
    case 'debate': {
      const rng = createRng(g.rngState);
      const topics = debateTopics(g);
      let platform = g.playerPlatform;
      // A charismatic opponent is harder to beat on stage; a research file sharpens attack answers.
      const opp = g.race.opponent;
      let performance = (3 - opp.charisma) * RACE.debateCharisma;
      for (const ans of a.answers) {
        const fx = DEBATE_EFFECTS[ans.style];
        electorate = shockFaction(electorate, wings.base, STATE_CODES, fx.base);
        electorate = shockFaction(electorate, wings.core, STATE_CODES, fx.core);
        electorate = shockFaction(electorate, wings.moderate, STATE_CODES, fx.moderate);
        electorate = shockFaction(electorate, 'independent', STATE_CODES, fx.independent);
        const topic = topics.find((t) => t.id === ans.topic)!;
        platform = pullAxis(platform, topic.axis, ans.style === 'center' ? FACTIONS.independent.idealPoint[topic.axis] : FACTIONS[wings.base].idealPoint[topic.axis], ans.style);
        performance += rng.normal(0, ans.style === 'attack' ? CAMPAIGN.debate.attackPerformanceSd : CAMPAIGN.debate.performanceSd);
        if (ans.style === 'attack') performance += RACE.debateOppoBonus * g.campaign.oppoFile;
      }
      electorate = shockFaction(electorate, 'independent', STATE_CODES, performance);
      message =
        performance > 1.5
          ? `Debate night: viewers say you beat ${opp.name} clearly.`
          : performance < -1.5
            ? `Debate night: a rough performance. Viewers say ${opp.name} won.`
            : `Debate night: viewers call it roughly even with ${opp.name}.`;
      return {
        state: {
          ...base,
          rngState: rng.state,
          electorate,
          playerPlatform: platform,
          campaign: { ...base.campaign, debateYear: g.year, recent: note(g, message) },
        },
        message,
      };
    }
    case 'name_successor': {
      const name = a.name.trim();
      message = `${name} is the party's nominee-in-waiting.`;
      return {
        state: { ...base, player: { ...g.player, name }, campaign: { ...base.campaign, successorNamed: true, recent: note(g, message) } },
        message,
      };
    }
  }
}

function pullAxis(p: GameState['playerPlatform'], axis: PolicyAxis, toward: number, style: DebateStyle) {
  if (style === 'attack') return p;
  const v = Object.fromEntries(POLICY_AXES.map((ax) => [ax, ax === axis ? toward : null])) as SparsePolicyVector;
  return updatePlayerPlatform(p, { policy_vector: v, radical_score: 4 });
}

// ---------------------------------------------------------------------------
// Primary
// ---------------------------------------------------------------------------

/** Expected primary vote share (before noise) and each wing's contribution. */
export function primaryStanding(g: GameState) {
  const sat = nationalFactionSatisfaction(g.electorate);
  const weights = PRIMARY_WEIGHTS[g.player.party];
  const rival = g.race.rival;
  const rivalWing = rival ? WINGS[g.player.party][rival.wing] : null;
  const wings = Object.entries(weights).map(([f, w]) => {
    const penalty = f === rivalWing ? RACE.rivalWingPenalty : 0;
    const support = clamp(0.5 + (sat[f as FactionId] - 50) / CAMPAIGN.primary.spread + CAMPAIGN.primary.frontRunnerBonus - penalty, 0, 1);
    return { faction: f as FactionId, weight: w!, satisfaction: sat[f as FactionId], support };
  });
  return { share: wings.reduce((s, w) => s + w.weight * w.support, 0), wings };
}

/** Resolves the primary at the end of Q2 of a presidential year (non-incumbents only). */
export function resolvePrimary(g: GameState, rng: Rng): GameState {
  const share = clamp(primaryStanding(g).share + rng.normal(0, CAMPAIGN.primary.noiseSd), 0, 1);
  const won = share >= 0.5;
  const rival = g.race.rival?.name ?? 'the field';
  const text = won
    ? `${g.player.name} wins the nomination with ${Math.round(share * 100)}% of primary votes, defeating ${rival}.`
    : `${g.player.name} loses the primary to ${rival}, with ${Math.round(share * 100)}% of the vote.`;
  const primary = { year: g.year, share, won, candidate: g.player.name };
  const campaign = { ...g.campaign, primary, recent: note(g, text) };
  return won
    ? { ...g, campaign }
    : { ...g, campaign, phase: 'game_over', gameOver: { reason: 'lost_primary', year: g.year } };
}

// ---------------------------------------------------------------------------
// Opposition response and cycle bookkeeping
// ---------------------------------------------------------------------------

/** The states closest to a tie right now, the opposition's ad targets. */
export function battlegrounds(g: GameState, n: number): StateCode[] {
  const ctx = electionContext(g);
  return [...STATE_CODES]
    .filter((s) => s !== 'DC')
    .map((s) => ({ s, m: Math.abs(stateVote(s, g.electorate[s], ctx, g.calibration[s]).margin) }))
    .sort((a, b) => a.m - b.m)
    .slice(0, n)
    .map((x) => x.s);
}

/** Each general/midterm campaign turn the opposition advertises in the closest states. */
export function oppositionAdResponse(g: GameState): GameState {
  if (g.phase !== 'general_campaign' && g.phase !== 'midterm_campaign') return g;
  const targets = battlegrounds(g, CAMPAIGN.oppositionAds.states);
  const scale = oppositionAdScale(g);
  let e = shockFaction(g.electorate, 'independent', targets, CAMPAIGN.oppositionAds.independentDelta * scale);
  e = shockFaction(e, WINGS[g.player.party].moderate, targets, CAMPAIGN.oppositionAds.moderateDelta * scale);
  const who = g.phase === 'general_campaign' ? `${g.race.opponent.name}’s campaign` : 'The opposition';
  const rr = g.campaign.rapidResponse ? ' Your rapid-response team blunted them.' : '';
  let recent = note(g, `${who} ran ads in ${targets.map((s) => STATES[s].name).join(', ')}.${rr}`);

  const hit = opponentAttackSize(g);
  if (hit > 0) {
    e = shockFaction(e, 'independent', STATE_CODES, -hit);
    const { axis } = weakestAxis(g);
    const text = `${g.race.opponent.name} went after your record on ${AXIS_TOPIC[axis]}: independents moved ${hit.toFixed(1)} points away from you.${rr}`;
    recent = [{ turn: g.turn, text }, ...recent].slice(0, 8);
  }
  return { ...g, electorate: e, campaign: { ...g.campaign, recent } };
}

/** New turn: actions and pledge reset. */
export const resetCampaignTurn = (c: CampaignState): CampaignState => ({
  ...c,
  actionsUsed: 0,
  pledgedThisTurn: false,
  rapidResponse: false,
  negativity: Math.max(0, c.negativity - RACE.attack.negativityDecay),
});

/** After an election: rallies and ad spend start over for the next cycle. */
export const resetCampaignCycle = (c: CampaignState): CampaignState => ({ ...c, rallies: {}, adSpend: {}, oppoFile: 0, negativity: 0 });

/** Plain-English topic for each policy axis, for attack lines. */
export const AXIS_TOPIC: Record<PolicyAxis, string> = {
  economic: 'taxes and spending',
  trade: 'trade',
  foreign_policy: 'foreign policy',
  immigration: 'immigration',
  social: 'social issues',
  institutional: 'how they would run the government',
};

export const FILE_LABEL = ['empty', 'thin', 'solid', 'devastating'] as const;

/** Rolls for backlash after a negative move; appends the outcome to the message. */
function withBacklash(g: GameState, factor: number, lead: string): { state: GameState; message: string } {
  const rng = createRng(g.rngState);
  const hit = rng.next() < backlashChance(g, factor);
  if (!hit) return { state: { ...g, rngState: rng.state }, message: `${lead}.` };
  const B = RACE.attack.backlash;
  let e = shockFaction(g.electorate, 'independent', STATE_CODES, B.independent);
  e = shockFaction(e, WINGS[g.player.party].moderate, STATE_CODES, B.ownModerate);
  return {
    state: { ...g, electorate: e, rngState: rng.state },
    message: `${lead}. But the press called it a cheap shot, and the backlash cost you with independents.`,
  };
}
