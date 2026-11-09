import { describe, expect, it } from 'vitest';
import { HOUSE_SEATS, SENATE_SEATS, STATE_CODES } from '@/domain/constants';
import { STATES } from '@/data/states';
import { LEGISLATURE } from '@/data/balance.config';
import { capitalCost, canAfford, regenerateCapital, spendCapital } from '../legislature/politicalCapital';
import {
  binomialPmf,
  coalitionMood,
  executiveOrderSurvival,
  forecastPassage,
  memberYesProbabilities,
  passProbability,
  resolveBill,
  rollCall,
} from '../legislature/passage';
import {
  apportionHouse,
  buildStartingCongress,
  houseCounts,
  seatShare,
  seatsUp,
  senateCounts,
} from '../legislature/seatModel';
import { nationalApproval } from '../electorate/approval';
import { buildInitialElectorate } from '../electorate/initElectorate';
import { shockFaction } from '../electorate/applyModifiers';
import { createRng } from '../rng';
import { makeBill } from './fixtures';

describe('political capital', () => {
  it('mainstream bills cost the base fee; radical bills cost more; EOs cost half', () => {
    expect(capitalCost(makeBill({ radical_score: 3 }))).toBe(5);
    expect(capitalCost(makeBill({ radical_score: 8 }))).toBe(35);
    expect(capitalCost(makeBill({ radical_score: 8, instrument: 'executive_order' }))).toBe(18);
  });

  it('checks affordability including whip spending', () => {
    expect(canAfford(40, makeBill({ radical_score: 8 }))).toBe(true);
    expect(canAfford(40, makeBill({ radical_score: 8 }), 10)).toBe(false);
  });

  it('refuses to overspend', () => {
    let threw = false;
    try {
      spendCapital(10, 20);
    } catch {
      threw = true;
    }
    expect(threw).toBe(true);
    expect(spendCapital(30, 20)).toBe(10);
  });

  it('popular presidents regenerate faster, capped at the max', () => {
    expect(regenerateCapital(20, 0.7)).toBeGreaterThan(regenerateCapital(20, 0.3));
    expect(regenerateCapital(99, 1)).toBe(LEGISLATURE.capitalMax);
  });
});

describe('approval', () => {
  it('is 50% at neutral and rises when voters are happier', () => {
    const base = buildInitialElectorate();
    expect(nationalApproval(base)).toBeCloseTo(0.5, 6);
    expect(nationalApproval(shockFaction(base, 'independent', STATE_CODES, 20))).toBeGreaterThan(0.5);
  });
});

describe('passage math', () => {
  const senate = { player: 53, opposition: 47 };
  const house = { player: 222, opposition: 213 };

  it('binomial PMF sums to 1 with mean n·p', () => {
    const pmf = binomialPmf(200, 0.3);
    const total = pmf.reduce((a, b) => a + b, 0);
    const mean = pmf.reduce((a, b, k) => a + b * k, 0);
    expect(total).toBeCloseTo(1, 9);
    expect(mean).toBeCloseTo(60, 6);
  });

  it('exact pass probability matches brute-force sampling', () => {
    const probs = { player: 0.9, opposition: 0.15 };
    const exact = passProbability(senate, probs, 55);
    const rng = createRng(4);
    let passes = 0;
    const n = 20_000;
    for (let i = 0; i < n; i++) if (rollCall(rng, senate, probs, 55).passed) passes++;
    expect(Math.abs(exact - passes / n)).toBeLessThan(0.015);
  });

  it('the filibuster makes radical partisan bills nearly impossible in the Senate', () => {
    const radical = forecastPassage(makeBill({ radical_score: 9 }), 'D', house, senate);
    const bipartisan = forecastPassage(makeBill({ radical_score: 2 }), 'D', house, senate);
    expect(radical.senate).toBeLessThan(0.05);
    expect(bipartisan.senate).toBeGreaterThan(0.5);
    expect(bipartisan.overall).toBeGreaterThan(radical.overall);
  });

  it('vague bills (low programmatic score) are penalized', () => {
    const concrete = memberYesProbabilities(makeBill({ programmatic_score: 8 }), 'R');
    const vague = memberYesProbabilities(makeBill({ programmatic_score: 2 }), 'R');
    expect(vague.player).toBeLessThan(concrete.player);
    expect(vague.opposition).toBeLessThan(concrete.opposition);
  });

  it('whipping with extra capital raises the odds', () => {
    const bill = makeBill({ radical_score: 6 });
    expect(forecastPassage(bill, 'R', house, senate, { whipCapital: 40 }).house).toBeGreaterThan(
      forecastPassage(bill, 'R', house, senate).house,
    );
  });

  it('members follow their coalition: a bill your own factions hate loses your own votes', () => {
    const hated = makeBill({ modifiers: { d_establishment: -8, d_progressive: -8, d_moderate: -8 } });
    expect(coalitionMood(hated, 'D')).toBeLessThan(-7);
    expect(memberYesProbabilities(hated, 'D').player).toBeLessThan(memberYesProbabilities(makeBill(), 'D').player);
  });

  it('resolves bills deterministically with a full roll-call tally', () => {
    const bill = makeBill({ radical_score: 2 });
    const a = resolveBill(createRng(10), bill, 'R', house, senate);
    const b = resolveBill(createRng(10), bill, 'R', house, senate);
    expect(a).toEqual(b);
    if (a.status === 'enacted') expect(a.house.yes + a.house.no).toBe(435);
  });

  it('reconciliation lets eligible budget bills pass the Senate with 51 (50 + VP)', () => {
    const budget = makeBill({ radical_score: 6, flags: { ...makeBill().flags, reconciliation_eligible: true } });
    const normal = forecastPassage(budget, 'D', house, senate);
    const recon = forecastPassage(budget, 'D', house, senate, { reconciliation: true });
    expect(recon.senate).toBeGreaterThan(normal.senate + 0.4);
    const ineligible = makeBill({ radical_score: 6 });
    expect(forecastPassage(ineligible, 'D', house, senate, { reconciliation: true }).senate).toBe(
      forecastPassage(ineligible, 'D', house, senate).senate,
    );
  });

  it('executive orders skip Congress but face court risk from legal flags', () => {
    const clean = makeBill({ instrument: 'executive_order' });
    const risky = makeBill({
      instrument: 'executive_order',
      flags: { ...clean.flags, likely_court_challenge: true, exceeds_executive_authority: true },
    });
    expect(executiveOrderSurvival(clean)).toBe(1);
    expect(executiveOrderSurvival(risky)).toBeLessThan(0.3);
    const outcome = resolveBill(createRng(1), clean, 'R', house, senate);
    expect(outcome.status).toBe('executive_order_upheld');
  });
});

describe('seat model', () => {
  it('seat–vote curve is symmetric and amplifies majorities', () => {
    expect(seatShare(0.5)).toBeCloseTo(0.5, 9);
    expect(seatShare(0.55)).toBeGreaterThan(0.55);
    expect(seatShare(0.45)).toBeCloseTo(1 - seatShare(0.55), 9);
  });

  it('apportionment never exceeds a state’s seats and totals 435', () => {
    const margins = Object.fromEntries(STATE_CODES.map((s) => [s, STATES[s].lean])) as Record<
      (typeof STATE_CODES)[number],
      number
    >;
    const seats = apportionHouse(margins);
    let total = 0;
    for (const s of STATE_CODES) {
      expect(seats[s]).toBeLessThanOrEqual(STATES[s].houseSeats);
      expect(seats[s]).toBeGreaterThanOrEqual(0);
      total += seats[s];
    }
    expect(total).toBeGreaterThan(150);
    expect(total).toBeLessThan(HOUSE_SEATS);
  });

  it('starting Congress is a full, competitive 435 + 100', () => {
    const c = buildStartingCongress();
    const h = houseCounts(c, 'R');
    const s = senateCounts(c, 'R');
    expect(h.player + h.opposition).toBe(HOUSE_SEATS);
    expect(s.player + s.opposition).toBe(SENATE_SEATS);
    expect(h.player).toBeGreaterThan(195);
    expect(h.player).toBeLessThan(250);
    for (const st of STATE_CODES) expect(c.house[st].R + c.house[st].D).toBe(STATES[st].houseSeats);
  });

  it('34 Class 3 seats are up in 2028, none in 2029', () => {
    const c = buildStartingCongress();
    expect(seatsUp(c, 2028).length).toBe(34);
    expect(seatsUp(c, 2029).length).toBe(0);
  });
});
