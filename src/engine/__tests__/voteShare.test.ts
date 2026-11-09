import { describe, expect, it } from 'vitest';
import { FACTION_IDS, STATE_CODES } from '@/domain/constants';
import { FACTIONS, FACTION_LIST } from '@/data/factions';
import { STATES } from '@/data/states';
import type { Party, StateCode } from '@/domain/types';
import { computePartyAnchor, opposingParty } from '../opposition/reactiveBaseline';
import { buildInitialElectorate } from '../electorate/initElectorate';
import { calibrateStates, nationalVote, playerVoteProbability, stateVote } from '../electorate/voteShare';
import { factionTurnout } from '../electorate/turnout';
import { proximityAdvantage } from '../electorate/proximity';
import { shockFaction } from '../electorate/applyModifiers';
import type { ElectionContext, ElectorateMap } from '../types';

const BASE = buildInitialElectorate();

function ctxFor(party: Party, overrides: Partial<ElectionContext> = {}): ElectionContext {
  return {
    playerParty: party,
    playerPlatform: computePartyAnchor(party, FACTION_LIST),
    oppositionPlatform: computePartyAnchor(opposingParty(party), FACTION_LIST),
    isMidterm: false,
    incumbentParty: null,
    ...overrides,
  };
}

function runAll(map: ElectorateMap, ctx: ElectionContext, cal: Record<StateCode, number>) {
  return STATE_CODES.map((s) => stateVote(s, map[s], ctx, cal[s]));
}

describe('calibration', () => {
  for (const party of ['R', 'D'] as const) {
    it(`as ${party}: every state's opening margin equals its authored lean`, () => {
      const cal = calibrateStates(BASE, party);
      const ctx = ctxFor(party);
      for (const r of runAll(BASE, ctx, cal)) {
        const expected = (party === 'R' ? 1 : -1) * STATES[r.state].lean;
        expect(r.margin).toBeCloseTo(expected, 6);
      }
    });
  }

  it('opening national popular vote is close (within 3 points)', () => {
    const cal = calibrateStates(BASE, 'R');
    const nat = nationalVote(runAll(BASE, ctxFor('R'), cal));
    expect(Math.abs(nat.margin)).toBeLessThan(3);
  });

  it('opening map is party-symmetric', () => {
    const r = runAll(BASE, ctxFor('R'), calibrateStates(BASE, 'R'));
    const d = runAll(BASE, ctxFor('D'), calibrateStates(BASE, 'D'));
    r.forEach((res, i) => expect(res.margin).toBeCloseTo(-d[i]!.margin, 6));
  });
});

describe('vote choice', () => {
  it('higher satisfaction → higher probability of voting for the player', () => {
    const ctx = ctxFor('R');
    expect(playerVoteProbability('independent', 70, ctx)).toBeGreaterThan(playerVoteProbability('independent', 40, ctx));
  });

  it('partisans lean toward their home party', () => {
    expect(playerVoteProbability('r_america_first', 50, ctxFor('R'))).toBeGreaterThan(0.8);
    expect(playerVoteProbability('d_progressive', 50, ctxFor('R'))).toBeLessThan(0.2);
  });

  it('pleasing independents moves a swing state toward the player', () => {
    const ctx = ctxFor('D');
    const cal = calibrateStates(BASE, 'D');
    const before = stateVote('AZ', BASE.AZ, ctx, cal.AZ).margin;
    const happier = shockFaction(BASE, 'independent', ['AZ'], 15);
    expect(stateVote('AZ', happier.AZ, ctx, cal.AZ).margin).toBeGreaterThan(before + 1);
  });

  it('the reactive opposition costs votes when it moves toward swing voters', () => {
    const ctx = ctxFor('R');
    const cal = calibrateStates(BASE, 'R');
    const before = stateVote('PA', BASE.PA, ctx, cal.PA).margin;
    const indIdeal = FACTIONS.independent.idealPoint;
    const smarterOpp = { ...ctx, oppositionPlatform: indIdeal };
    expect(stateVote('PA', BASE.PA, smarterOpp, cal.PA).margin).toBeLessThan(before);
  });

  it('third-party share is higher in libertarian states', () => {
    const ctx = ctxFor('R');
    expect(stateVote('MT', BASE.MT, ctx).thirdShare).toBeGreaterThan(stateVote('NJ', BASE.NJ, ctx).thirdShare);
  });

  it('shares sum to 1', () => {
    const r = stateVote('OH', BASE.OH, ctxFor('R'));
    expect(r.playerShare + r.oppositionShare + r.thirdShare).toBeCloseTo(1, 9);
  });
});

describe('proximity', () => {
  it('is positive when the player sits on the faction’s ideal point', () => {
    const f = FACTIONS.d_moderate;
    expect(proximityAdvantage(f, f.idealPoint, FACTIONS.r_america_first.idealPoint)).toBeGreaterThan(0);
  });
});

describe('turnout', () => {
  const opts = { isMidterm: false, incumbentParty: null };

  it('energized and enraged factions both turn out more than indifferent ones', () => {
    const e = BASE.GA.d_progressive;
    const neutral = factionTurnout('d_progressive', e, opts);
    expect(factionTurnout('d_progressive', { ...e, satisfaction: 95 }, opts)).toBeGreaterThan(neutral);
    expect(factionTurnout('d_progressive', { ...e, satisfaction: 5 }, opts)).toBeGreaterThan(neutral);
  });

  it('elastic factions swing more than establishment wings', () => {
    const swing = (f: (typeof FACTION_IDS)[number]) =>
      factionTurnout(f, { ...BASE.OH[f], satisfaction: 95 }, opts) - factionTurnout(f, BASE.OH[f], opts);
    expect(swing('d_progressive')).toBeGreaterThan(swing('r_establishment'));
  });

  it('midterms lower turnout, and hit the incumbent party’s factions harder', () => {
    const e = BASE.MI.r_america_first;
    const pres = factionTurnout('r_america_first', e, opts);
    const midOut = factionTurnout('r_america_first', e, { isMidterm: true, incumbentParty: 'D' });
    const midIn = factionTurnout('r_america_first', e, { isMidterm: true, incumbentParty: 'R' });
    expect(midOut).toBeLessThan(pres);
    expect(midIn).toBeLessThan(midOut);
  });

  it('rule-driven turnout shifts are applied', () => {
    const e = BASE.CA.d_progressive;
    expect(factionTurnout('d_progressive', { ...e, turnoutShift: 0.05 }, opts)).toBeGreaterThan(
      factionTurnout('d_progressive', e, opts),
    );
  });
});
