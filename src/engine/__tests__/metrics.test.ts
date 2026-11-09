import { describe, expect, it } from 'vitest';
import { STATE_CODES } from '@/domain/constants';
import { STATES } from '@/data/states';
import { INITIAL_METRICS, METRIC_BOUNDS } from '@/data/initialState';
import { EVENTS } from '@/data/events';
import { applyBillImpacts, applyShock, implementationFactor, metricPressure, stepMetrics } from '../economy/metrics';
import { impactToShock } from '../economy/impactTables';
import { advanceEventHistory, applyEvent, drawEvent, eventWeight } from '../events/eventTicker';
import { buildInitialElectorate } from '../electorate/initElectorate';
import { createRng } from '../rng';
import { makeBill } from './fixtures';

describe('impact tables', () => {
  it('maps qualitative tags to shocks and "none" to null', () => {
    expect(impactToShock('inflation', 'up', 'major')).toEqual({ op: 'add', value: 0.6 });
    expect(impactToShock('gas_price', 'none', 'major')).toBe(null);
    expect(impactToShock('gas_price', 'down', 'none')).toBe(null);
  });
});

describe('bill impacts', () => {
  const impacts = { ...makeBill().metric_impacts, border_crossings: { direction: 'down', magnitude: 'major' } } as const;

  it('concrete bills deliver more than vague ones', () => {
    const concrete = applyBillImpacts(INITIAL_METRICS, makeBill({ metric_impacts: impacts, programmatic_score: 10 }));
    const vague = applyBillImpacts(INITIAL_METRICS, makeBill({ metric_impacts: impacts, programmatic_score: 1 }));
    expect(concrete.border_crossings).toBeLessThan(vague.border_crossings);
    expect(vague.border_crossings).toBeLessThan(INITIAL_METRICS.border_crossings);
  });

  it('implementation factor spans 0.55×–1.0×', () => {
    expect(implementationFactor(1)).toBeCloseTo(0.55);
    expect(implementationFactor(10)).toBeCloseTo(1);
  });

  it('clamps to metric bounds', () => {
    let m = INITIAL_METRICS;
    for (let i = 0; i < 50; i++) m = applyShock(m, 'conflict_index', { op: 'add', value: 10 });
    expect(m.conflict_index).toBe(METRIC_BOUNDS.conflict_index.max);
  });
});

describe('background drift', () => {
  it('mean-reverts gas and inflation, grows the debt', () => {
    const hot = { ...INITIAL_METRICS, gas_price: 6, inflation: 8 };
    const next = stepMetrics(hot);
    expect(next.gas_price).toBeLessThan(6);
    expect(next.inflation).toBeLessThan(8);
    expect(next.national_debt).toBeGreaterThan(hot.national_debt);
  });
});

describe('metric pressure', () => {
  it('is zero when everything is inside comfort levels', () => {
    const calm = { ...INITIAL_METRICS, national_debt: 40 };
    expect(Object.values(metricPressure(calm)).every((v) => v === 0)).toBe(true);
  });

  it('a border surge hurts America First far more than progressives', () => {
    const p = metricPressure({ ...INITIAL_METRICS, border_crossings: 150_000 });
    expect(p.r_america_first).toBeLessThan(p.d_progressive);
    expect(p.d_progressive).toBeLessThanOrEqual(0);
  });

  it('debt pressure tracks the baseline deficit path, not the absolute level', () => {
    const onPath = { ...INITIAL_METRICS, national_debt: 45 + 0.5 * 40 };
    expect(Object.values(metricPressure(onPath, undefined, { turn: 40 })).every((v) => v === 0)).toBe(true);
    expect(metricPressure(onPath, undefined, { turn: 0 }).libertarian_third).toBeLessThan(0);
  });

  it('inflation hits independents hardest', () => {
    const p = metricPressure({ ...INITIAL_METRICS, inflation: 7 });
    expect(p.independent).toBeLessThan(p.d_establishment);
  });
});

describe('event ticker', () => {
  const hurricane = EVENTS.find((e) => e.id === 'gulf_hurricane')!;
  const embargo = EVENTS.find((e) => e.id === 'oil_embargo')!;

  it('applies regional faction shocks only to the targeted region', () => {
    const { electorate } = applyEvent(hurricane, INITIAL_METRICS, buildInitialElectorate());
    for (const s of STATE_CODES) {
      const hit = ['deep_south', 'southeast'].includes(STATES[s].region);
      if (hit) expect(electorate[s].independent.satisfaction).toBeLessThan(50);
      else expect(electorate[s].independent.satisfaction).toBe(50);
    }
  });

  it('applies metric shocks', () => {
    const { metrics } = applyEvent(embargo, INITIAL_METRICS, buildInitialElectorate());
    expect(metrics.gas_price).toBeGreaterThan(INITIAL_METRICS.gas_price);
  });

  it('conditions raise the odds; cooldowns zero them', () => {
    const tense = { ...INITIAL_METRICS, conflict_index: 70 };
    expect(eventWeight(embargo, tense, undefined)).toBe(embargo.baseWeight * 2);
    expect(eventWeight(embargo, INITIAL_METRICS, 1)).toBe(0);
    expect(eventWeight(embargo, INITIAL_METRICS, embargo.cooldownTurns)).toBe(embargo.baseWeight);
  });

  it('draws deterministically and never draws an event on cooldown', () => {
    const history = { gulf_hurricane: 0 };
    const a = drawEvent(createRng(5), INITIAL_METRICS, history).id;
    expect(drawEvent(createRng(5), INITIAL_METRICS, history).id).toBe(a);
    const rng = createRng(9);
    for (let i = 0; i < 500; i++) expect(drawEvent(rng, INITIAL_METRICS, history).id).not.toBe('gulf_hurricane');
  });

  it('advances cooldown history', () => {
    expect(advanceEventHistory({ a: 0, b: 3 }, 'c')).toEqual({ a: 1, b: 4, c: 0 });
  });
});
