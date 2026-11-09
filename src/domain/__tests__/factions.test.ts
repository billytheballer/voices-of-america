import { describe, expect, it } from 'vitest';
import { FACTIONS, FACTION_LIST } from '@/data/factions';
import { COALITION_IDS, COALITION_MEMBERS, FACTION_IDS, POLICY_AXES } from '../constants';
import { coalitionOf, sumByCoalition, weightedMeanByCoalition } from '../coalitions';
import type { FactionRecord } from '../types';

describe('faction config', () => {
  it('defines exactly the 8 canonical factions', () => {
    expect(Object.keys(FACTIONS).sort()).toEqual([...FACTION_IDS].sort());
  });

  it('national weights sum to 1', () => {
    const total = FACTION_LIST.reduce((s, f) => s + f.nationalWeight, 0);
    expect(total).toBeCloseTo(1, 6);
  });

  it('every coalition membership matches the faction definition', () => {
    for (const c of COALITION_IDS) {
      for (const f of COALITION_MEMBERS[c]) expect(FACTIONS[f].coalition).toBe(c);
    }
  });

  it('every faction maps into exactly one coalition bucket', () => {
    const all = COALITION_IDS.flatMap((c) => [...COALITION_MEMBERS[c]]);
    expect(all.sort()).toEqual([...FACTION_IDS].sort());
  });

  it('ideal points and salience are in range on every axis', () => {
    for (const f of FACTION_LIST) {
      for (const a of POLICY_AXES) {
        expect(Math.abs(f.idealPoint[a])).toBeLessThanOrEqual(10);
        expect(f.axisSalience[a]).toBeGreaterThanOrEqual(0);
        expect(f.axisSalience[a]).toBeLessThanOrEqual(1);
      }
    }
  });

  it('applies the 90% structural media/fundraising penalty to Libertarians/third parties', () => {
    expect(FACTIONS.libertarian_third.structural).toEqual({ media: 0.1, fundraising: 0.1 });
  });
});

describe('coalition rollups (3 buckets → 8-way drill-down)', () => {
  const weights = Object.fromEntries(FACTION_LIST.map((f) => [f.id, f.nationalWeight])) as FactionRecord<number>;

  it('sum rollup of population weights totals 1 and keeps all members', () => {
    const r = sumByCoalition(weights);
    expect(r.gop.value + r.dem.value + r.third.value).toBeCloseTo(1, 6);
    expect(r.gop.members.map((m) => m.faction)).toEqual([...COALITION_MEMBERS.gop]);
  });

  it('weighted mean rollup weights members by size', () => {
    const sat = Object.fromEntries(FACTION_IDS.map((f) => [f, 50])) as FactionRecord<number>;
    sat.independent = 100; // big faction
    sat.libertarian_third = 0; // small faction
    const r = weightedMeanByCoalition(sat, weights);
    expect(r.third.value).toBeGreaterThan(50);
    expect(r.gop.value).toBe(50);
  });

  it('coalitionOf resolves each faction', () => {
    expect(coalitionOf('d_progressive')).toBe('dem');
    expect(coalitionOf('libertarian_third')).toBe('third');
  });
});
