import { describe, expect, it } from 'vitest';
import { STATE_CODES } from '@/domain/constants';
import { CAMPAIGN, WINGS } from '@/data/campaign';
import { nationalFactionSatisfaction } from '../electorate/approval';
import { shockFaction } from '../electorate/applyModifiers';
import { newGame } from '../loop/newGame';
import { endTurn } from '../loop/actions';
import { createRng } from '../rng';
import {
  adEffect,
  battlegrounds,
  campaignRejection,
  debateTopics,
  fundraiseAmount,
  oppositionAdResponse,
  performCampaignAction,
  primaryStanding,
  rallyFactor,
  resolvePrimary,
  type CampaignAction,
} from '../campaign/campaign';
import type { GameState } from '../loop/types';

const start = () => newGame({ seed: 8, playerName: 'Casey Morgan', party: 'R', difficulty: 'balanced' });
const act = (g: GameState, a: CampaignAction) => performCampaignAction(g, a).state;
const general = (g: GameState): GameState => ({ ...g, year: 2028, quarter: 3, phase: 'general_campaign' });

describe('campaign actions', () => {
  it('fundraising adds money, pleases donors, irritates the base', () => {
    const g = start();
    const n = act(g, { type: 'fundraise' });
    expect(n.campaign.funds).toBe(g.campaign.funds + fundraiseAmount(g));
    const before = nationalFactionSatisfaction(g.electorate);
    const after = nationalFactionSatisfaction(n.electorate);
    expect(after.r_establishment).toBeGreaterThan(before.r_establishment);
    expect(after.r_america_first).toBeLessThan(before.r_america_first);
  });

  it('rallies boost home-faction turnout in that state, with diminishing returns', () => {
    const g = start();
    const once = act(g, { type: 'rally', state: 'PA' });
    expect(once.electorate.PA.r_america_first.turnoutShift).toBeGreaterThan(0);
    expect(once.electorate.OH.r_america_first.turnoutShift).toBe(g.electorate.OH.r_america_first.turnoutShift);
    expect(rallyFactor(once, 'PA')).toBe(0.5);
    const twice = act(once, { type: 'rally', state: 'PA' });
    const gain1 = once.electorate.PA.independent.satisfaction - g.electorate.PA.independent.satisfaction;
    const gain2 = twice.electorate.PA.independent.satisfaction - once.electorate.PA.independent.satisfaction;
    expect(gain2).toBeLessThan(gain1);
  });

  it('ads cost money, persuade more per dollar in small states, and saturate', () => {
    const g = start();
    expect(adEffect(g, 'NH', 20)).toBeGreaterThan(adEffect(g, 'TX', 20));
    const spent = act(g, { type: 'ad', state: 'WI', amount: 20 });
    expect(spent.campaign.funds).toBe(g.campaign.funds - 20);
    expect(adEffect(spent, 'WI', 20)).toBeLessThan(adEffect(g, 'WI', 20));
    expect(adEffect(g, 'WI', 60)).toBeLessThanOrEqual(CAMPAIGN.ads.maxPerBuy);
  });

  it('enforces season, action budget, funds and amounts', () => {
    const g = start();
    expect(campaignRejection({ ...g, phase: 'governing' }, { type: 'fundraise' })).toBe('not_campaign_season');
    let s = g;
    for (let i = 0; i < CAMPAIGN.actionsPerTurn; i++) s = act(s, { type: 'fundraise' });
    expect(campaignRejection(s, { type: 'rally', state: 'PA' })).toBe('no_actions_left');
    expect(campaignRejection(g, { type: 'ad', state: 'PA', amount: 1 })).toBe('invalid_amount');
    expect(campaignRejection({ ...g, campaign: { ...g.campaign, funds: 10 } }, { type: 'ad', state: 'PA', amount: 20 })).toBe('insufficient_funds');
  });

  it('actions reset each turn', () => {
    let s = start();
    for (let i = 0; i < CAMPAIGN.actionsPerTurn; i++) s = act(s, { type: 'fundraise' });
    expect(endTurn(s).campaign.actionsUsed).toBe(0);
  });
});

describe('primary', () => {
  it('a pledge wins a wing but pulls the platform toward it', () => {
    const g = start();
    const n = act(g, { type: 'pledge', faction: 'r_america_first' });
    expect(nationalFactionSatisfaction(n.electorate).r_america_first).toBeGreaterThan(nationalFactionSatisfaction(g.electorate).r_america_first + 3);
    expect(n.playerPlatform.trade).toBeGreaterThan(g.playerPlatform.trade);
    expect(campaignRejection(n, { type: 'pledge', faction: 'r_establishment' })).toBe('already_pledged');
    expect(campaignRejection(g, { type: 'pledge', faction: 'd_progressive' })).toBe('not_own_faction');
  });

  it('a contented party nominates you; an angry base can deny you', () => {
    const g = start();
    expect(primaryStanding(g).share).toBeGreaterThan(0.65);
    expect(resolvePrimary(g, createRng(1)).campaign.primary!.won).toBe(true);

    let angry = g.electorate;
    for (const f of Object.values(WINGS.R)) angry = shockFaction(angry, f, STATE_CODES, -25);
    const lost = resolvePrimary({ ...g, electorate: angry }, createRng(1));
    expect(lost.campaign.primary!.won).toBe(false);
    expect(lost.gameOver).toEqual({ reason: 'lost_primary', year: 2028 });
  });

  it('the primary resolves when Q2 of the election year ends', () => {
    let s = start();
    s = endTurn(s);
    expect(s.campaign.primary).toBe(null);
    s = endTurn(s);
    expect(s.campaign.primary?.year).toBe(2028);
  });
});

describe('debate', () => {
  it('happens once per presidential general campaign, with three fixed topics', () => {
    const g = general(start());
    const topics = debateTopics(g);
    expect(topics.length).toBe(3);
    expect(debateTopics(g)).toEqual(topics);
    const answers = topics.map((t) => ({ topic: t.id, style: 'center' as const }));
    const after = act(g, { type: 'debate', answers });
    expect(after.campaign.debateYear).toBe(2028);
    expect(campaignRejection(after, { type: 'debate', answers })).toBe('no_debate_now');
    expect(campaignRejection(start(), { type: 'debate', answers })).toBe('no_debate_now');
  });

  it('centrist answers court independents; base answers court the activists', () => {
    const g = general(start());
    const topics = debateTopics(g);
    const center = act(g, { type: 'debate', answers: topics.map((t) => ({ topic: t.id, style: 'center' as const })) });
    const base = act(g, { type: 'debate', answers: topics.map((t) => ({ topic: t.id, style: 'base' as const })) });
    const c = nationalFactionSatisfaction(center.electorate);
    const b = nationalFactionSatisfaction(base.electorate);
    expect(b.r_america_first).toBeGreaterThan(c.r_america_first);
    // Same RNG draw for performance, so the style is the only difference.
    expect(c.independent).toBeGreaterThan(b.independent);
  });
});

describe('opposition response and successor', () => {
  it('the opposition advertises in the closest states during the general campaign', () => {
    const g = general(start());
    const targets = battlegrounds(g, CAMPAIGN.oppositionAds.states);
    const n = oppositionAdResponse(g);
    for (const s of targets) expect(n.electorate[s].independent.satisfaction).toBeLessThan(g.electorate[s].independent.satisfaction);
    expect(oppositionAdResponse(start())).toEqual(start()); // not during primaries
  });

  it('the player names the successor once', () => {
    const g: GameState = { ...start(), player: { ...start().player, generation: 1, name: 'Casey Morgan (Successor 1)' }, campaign: { ...start().campaign, successorNamed: false } };
    expect(campaignRejection(g, { type: 'name_successor', name: 'x' })).toBe('invalid_name');
    const n = act(g, { type: 'name_successor', name: 'Jordan Reyes' });
    expect(n.player.name).toBe('Jordan Reyes');
    expect(campaignRejection(n, { type: 'name_successor', name: 'Someone Else' })).toBe('no_successor_to_name');
  });
});
