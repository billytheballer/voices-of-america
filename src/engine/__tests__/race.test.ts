import { describe, expect, it } from 'vitest';
import { STATE_CODES } from '@/domain/constants';
import { CANDIDATE_POOLS, REAL_POOL_LAST_CYCLE } from '@/data/candidates';
import { FACTIONS } from '@/data/factions';
import { nationalFactionSatisfaction } from '../electorate/approval';
import { newGame } from '../loop/newGame';
import { endTurn } from '../loop/actions';
import { campaignRejection, oppositionAdResponse, performCampaignAction, primaryStanding, resetCampaignTurn, type CampaignAction } from '../campaign/campaign';
import {
  attackEffectiveness,
  drawCandidate,
  drawRace,
  ensureRace,
  nominateOpponent,
  opponentAttackSize,
  recordAttackGain,
  recordContrast,
} from '../campaign/race';
import type { GameState } from '../loop/types';

const start = (party: 'R' | 'D' = 'D', seed = 5) => newGame({ seed, playerName: 'Riley Park', party, difficulty: 'balanced' });
const general = (g: GameState): GameState => ({ ...g, quarter: 3, phase: 'general_campaign' });
const act = (g: GameState, a: CampaignAction) => performCampaignAction(g, a).state;
const indSat = (g: GameState) => nationalFactionSatisfaction(g.electorate).independent;

describe('the opponent field', () => {
  it('a 2028 game faces a real politician from the other party, and a real primary rival', () => {
    const g = start('D');
    expect(g.race.cycle).toBe(2028);
    expect(g.race.opponent.party).toBe('R');
    expect(g.race.opponent.real).toBe(true);
    expect(CANDIDATE_POOLS.R.map((c) => c.id)).toContain(g.race.opponent.id);
    expect(g.race.rival?.party).toBe('D');
    expect(g.race.rival?.real).toBe(true);
    expect(g.race.rival?.id).not.toBe(g.race.opponent.id);
  });

  it('is deterministic per seed and varies across seeds', () => {
    expect(start('R', 9).race.opponent.id).toBe(start('R', 9).race.opponent.id);
    const names = new Set(Array.from({ length: 30 }, (_, i) => start('R', i).race.opponent.id));
    expect(names.size).toBeGreaterThan(3);
  });

  it('nobody runs twice, and after the real pools end the candidates are generated', () => {
    const used: string[] = [];
    for (let cycle = 2028; cycle <= REAL_POOL_LAST_CYCLE; cycle += 4) {
      const c = drawCandidate(1, 'D', cycle, 'opponent', used);
      expect(c.real).toBe(true);
      expect(used).not.toContain(c.id);
      used.push(c.id);
    }
    const later = drawCandidate(1, 'D', 2060, 'opponent', used);
    expect(later.real).toBe(false);
    expect(later.name.split(' ').length).toBe(2);
    expect(later.home).not.toBe('DC');
    expect(drawRace({ seed: 1, player: { ...start().player, isPresident: true } }, 2032, []).rival).toBe(null);
  });

  it('a new field is drawn once the election year is over', () => {
    const g = { ...start(), year: 2029, quarter: 1 as const, phase: 'governing' as const };
    const next = ensureRace(g);
    expect(next.race.cycle).toBe(2032);
    expect(next.race.used).toContain(g.race.opponent.id);
    expect(next.race.opponent.id).not.toBe(g.race.opponent.id);
    expect(ensureRace(next)).toBe(next);
  });

  it('the convention rallies the home state and pulls the opposition toward the nominee’s wing', () => {
    const g = start('D');
    const n = nominateOpponent(g);
    const home = g.race.opponent.home;
    expect(n.race.nominated).toBe(true);
    expect(n.electorate[home].independent.satisfaction).toBeLessThan(g.electorate[home].independent.satisfaction);
    const other = STATE_CODES.find((s) => s !== home)!;
    expect(n.electorate[other].independent.satisfaction).toBe(g.electorate[other].independent.satisfaction);
  });

  it('endTurn nominates the opponent when the general campaign opens', () => {
    let g: GameState = { ...start('D'), quarter: 2 };
    // Make sure the player survives the primary.
    g = { ...g, electorate: Object.fromEntries(STATE_CODES.map((s) => [s, Object.fromEntries(Object.entries(g.electorate[s]).map(([f, v]) => [f, FACTIONS[f as keyof typeof FACTIONS].homeParty === 'D' ? { ...v, satisfaction: 80 } : v]))])) as GameState['electorate'] };
    const n = endTurn(g);
    expect(n.phase).toBe('general_campaign');
    expect(n.race.nominated).toBe(true);
    expect(n.campaign.recent.some((r) => r.text.includes(g.race.opponent.name))).toBe(true);
  });

  it('the primary rival costs support in their wing', () => {
    const g = start('D');
    const without = primaryStanding({ ...g, race: { ...g.race, rival: null } });
    expect(primaryStanding(g).share).toBeLessThan(without.share);
  });
});

describe('going negative', () => {
  it('hitting their record works where they are far from independents, and fails where you are', () => {
    const g = general(start('D'));
    const strong = { ...g, oppositionPlatform: { ...g.oppositionPlatform, immigration: 10 }, playerPlatform: { ...g.playerPlatform, immigration: 3 } };
    expect(recordContrast(strong, 'immigration')).toBeGreaterThan(0);
    expect(recordAttackGain(strong, 'immigration')).toBeGreaterThan(0);
    const weak = { ...g, oppositionPlatform: { ...g.oppositionPlatform, social: -1 }, playerPlatform: { ...g.playerPlatform, social: -9 } };
    expect(recordAttackGain(weak, 'social')).toBeLessThan(0);
  });

  it('attacks cost money and an action, raise negativity and lose force when repeated', () => {
    const g = general(start('D'));
    const once = act(g, { type: 'attack_record', axis: 'immigration' });
    expect(once.campaign.funds).toBe(g.campaign.funds - 10);
    expect(once.campaign.actionsUsed).toBe(1);
    expect(once.campaign.negativity).toBe(1);
    expect(attackEffectiveness(once)).toBeLessThan(attackEffectiveness(g));
    // Negativity fades between quarters.
    expect(resetCampaignTurn(once.campaign).negativity).toBe(0);
  });

  it('opposition research builds a file; releasing it moves independents and empties the file', () => {
    let g = general(start('D'));
    expect(campaignRejection(g, { type: 'release_oppo' })).toBe('no_file');
    g = act(g, { type: 'oppo_research' });
    expect(g.campaign.oppoFile).toBeGreaterThan(0);
    const released = act(g, { type: 'release_oppo' });
    expect(released.campaign.oppoFile).toBe(0);
    // Backlash can eat the gain, so check the turnout effect, which is certain.
    expect(released.electorate.OH.r_america_first.turnoutShift).toBeLessThan(g.electorate.OH.r_america_first.turnoutShift);
  });

  it('negative ads depress the other side’s turnout in that state', () => {
    const g = general(start('D'));
    const n = act(g, { type: 'ad', state: 'PA', amount: 20, tone: 'negative' });
    expect(n.electorate.PA.r_establishment.turnoutShift).toBeLessThan(g.electorate.PA.r_establishment.turnoutShift);
    expect(n.campaign.negativity).toBe(0.5);
  });

  it('backlash is possible: across many seeds some attacks cost independents', () => {
    const g = general(start('D'));
    const strong = { ...g, oppositionPlatform: { ...g.oppositionPlatform, immigration: 10 }, playerPlatform: { ...g.playerPlatform, immigration: 3 }, campaign: { ...g.campaign, negativity: 4 } };
    let backlash = 0;
    for (let s = 0; s < 100; s++) {
      const r = performCampaignAction({ ...strong, rngState: s * 31 + 7 }, { type: 'attack_record', axis: 'immigration' });
      if (r.message.includes('cheap shot')) backlash++;
    }
    expect(backlash).toBeGreaterThan(10);
    expect(backlash).toBeLessThan(80);
  });

  it('the opponent hits your weakest position, and rapid response halves it and their ads', () => {
    const g = general(start('D'));
    const exposed = { ...g, playerPlatform: { ...g.playerPlatform, immigration: -9 } };
    const hit = opponentAttackSize(exposed);
    expect(hit).toBeGreaterThan(0);
    const guarded = act(exposed, { type: 'rapid_response' });
    expect(opponentAttackSize(guarded)).toBeCloseTo(hit / 2, 5);
    expect(campaignRejection(guarded, { type: 'rapid_response' })).toBe('already_responding');
    const lossOpen = indSat(exposed) - indSat(oppositionAdResponse(exposed));
    const lossGuarded = indSat(guarded) - indSat(oppositionAdResponse(guarded));
    expect(lossGuarded).toBeLessThan(lossOpen);
    expect(oppositionAdResponse(exposed).campaign.recent[0]!.text).toContain(g.race.opponent.name);
  });
});
