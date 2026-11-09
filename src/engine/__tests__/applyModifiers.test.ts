import { describe, expect, it } from 'vitest';
import { STATE_CODES } from '@/domain/constants';
import { STATES } from '@/data/states';
import { SATISFACTION } from '@/data/balance.config';
import { buildInitialElectorate } from '../electorate/initElectorate';
import { applyBill, decayElectorate, evaluateCondition, shockFaction } from '../electorate/applyModifiers';
import { makeBill, NO_AXES } from './fixtures';

const BASE = buildInitialElectorate();
const suburban = STATE_CODES.filter((s) => STATES[s].tags.includes('suburban_swing'));
const nonSuburban = STATE_CODES.filter((s) => !STATES[s].tags.includes('suburban_swing'));

describe('applyBill', () => {
  it('scales LLM modifiers nationwide', () => {
    const { electorate } = applyBill(BASE, makeBill({ modifiers: { independent: 4 } }), []);
    for (const s of STATE_CODES) {
      expect(electorate[s].independent.satisfaction).toBeCloseTo(50 + 4 * SATISFACTION.modifierScale);
    }
  });

  it('applies state overrides only to that state', () => {
    const bill = makeBill({ state_overrides: [{ state: 'CA', faction: 'd_moderate', delta: 3, reason: 'ag visas' }] });
    const { electorate } = applyBill(BASE, bill, []);
    expect(electorate.CA.d_moderate.satisfaction).toBeGreaterThan(50);
    expect(electorate.TX.d_moderate.satisfaction).toBe(50);
  });

  it('does not mutate its input', () => {
    applyBill(BASE, makeBill({ modifiers: { independent: 10 } }));
    expect(BASE.OH.independent.satisfaction).toBe(50);
  });

  it('clamps satisfaction to 0–100', () => {
    let m = BASE;
    for (let i = 0; i < 10; i++) m = applyBill(m, makeBill({ modifiers: { libertarian_third: -10 } }), []).electorate;
    expect(m.MT.libertarian_third.satisfaction).toBe(0);
  });

  it('returns an audit trail', () => {
    const { effects } = applyBill(BASE, makeBill({ modifiers: { d_progressive: 2 } }), []);
    expect(effects.length).toBe(1);
    expect(effects[0]!.source).toBe('llm_modifier');
  });
});

describe('faction rules', () => {
  it('America First punishes blank-check foreign aid', () => {
    const bill = makeBill({ flags: { ...makeBill().flags, foreign_aid_blank_check: true } });
    const { electorate, effects } = applyBill(BASE, bill);
    expect(electorate.OH.r_america_first.satisfaction).toBeLessThan(50);
    expect(electorate.OH.r_america_first.turnoutShift).toBeLessThan(0);
    expect(effects.some((e) => e.sourceId === 'af_foreign_aid_blank_check')).toBe(true);
  });

  it('…but not when the aid carries a tangible domestic ROI', () => {
    const bill = makeBill({
      flags: { ...makeBill().flags, foreign_aid_blank_check: true, domestic_roi_tangible: true },
      policy_vector: { ...NO_AXES, foreign_policy: 4 },
    });
    const { electorate } = applyBill(BASE, bill);
    expect(electorate.OH.r_america_first.satisfaction).toBeGreaterThan(50);
  });

  it('progressive suburban ceiling hits suburban swing states only, and lifts urban progressive turnout', () => {
    const bill = makeBill({ policy_vector: { ...NO_AXES, social: -8 } });
    const { electorate } = applyBill(BASE, bill);
    for (const s of suburban) expect(electorate[s].independent.satisfaction).toBeLessThan(50);
    for (const s of nonSuburban) expect(electorate[s].independent.satisfaction).toBe(50);
    expect(electorate.NY.d_progressive.turnoutShift).toBeGreaterThan(0); // NY is urban_core
    expect(electorate.WV.d_progressive.turnoutShift).toBe(0);
  });

  it('extremism backlash is symmetric: far right and far left both cost independents', () => {
    const right = applyBill(BASE, makeBill({ policy_vector: { ...NO_AXES, immigration: 10 } })).electorate;
    const left = applyBill(BASE, makeBill({ policy_vector: { ...NO_AXES, economic: -10 } })).electorate;
    expect(right.WV.independent.satisfaction).toBeLessThan(50);
    expect(left.WV.independent.satisfaction).toBeLessThan(50);
  });

  it('condition evaluator ignores axes the bill does not touch', () => {
    expect(evaluateCondition({ kind: 'axis', axis: 'social', op: 'lte', value: 0 }, makeBill())).toBe(false);
  });
});

describe('decay', () => {
  it('pulls satisfaction back toward 50 and fades turnout shifts', () => {
    const shocked = shockFaction(BASE, 'independent', ['AZ'], 30, 0.1);
    const decayed = decayElectorate(shocked);
    expect(decayed.AZ.independent.satisfaction).toBeLessThan(80);
    expect(decayed.AZ.independent.satisfaction).toBeGreaterThan(50);
    expect(decayed.AZ.independent.turnoutShift).toBeLessThan(0.1);
  });
});
