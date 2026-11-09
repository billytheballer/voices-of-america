import { describe, expect, it } from 'vitest';
import {
  ELECTORAL_VOTES_TO_WIN,
  FACTION_IDS,
  FEED_SIZE,
  HOUSE_SEATS,
  METRIC_IDS,
  STATE_CODES,
  TOTAL_ELECTORAL_VOTES,
} from '@/domain/constants';
import { STATES, STATE_LIST } from '../states';
import { coalitionPools, deriveStateElectorate } from '../derive/stateElectorate';
import { buildStartingSenate, classUpInYear, SENATE_CLASSES } from '../senateClasses';
import { ARCHETYPES, ARCHETYPE_IDS } from '../archetypes';
import { EVENTS } from '../events';
import { INITIAL_METRICS, METRIC_BOUNDS } from '../initialState';

describe('states', () => {
  it('covers all 50 states + DC exactly once', () => {
    expect(STATE_LIST.length).toBe(51);
    expect(Object.keys(STATES).sort()).toEqual([...STATE_CODES].sort());
  });

  it(`totals ${TOTAL_ELECTORAL_VOTES} electoral votes and ${HOUSE_SEATS} House seats`, () => {
    expect(STATE_LIST.reduce((s, x) => s + x.electoralVotes, 0)).toBe(TOTAL_ELECTORAL_VOTES);
    expect(STATE_LIST.reduce((s, x) => s + x.houseSeats, 0)).toBe(HOUSE_SEATS);
  });

  it('keeps dials in range', () => {
    for (const s of STATE_LIST) {
      for (const v of [s.urbanization, s.libertarianStreak, s.progressiveHub]) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
      expect(Math.abs(s.turnoutModifier)).toBeLessThanOrEqual(0.1);
    }
  });

  it('gives Maine and Nebraska district-level EVs that add up', () => {
    expect(STATES.ME.districts?.length).toBe(STATES.ME.electoralVotes - 2);
    expect(STATES.NE.districts?.length).toBe(STATES.NE.electoralVotes - 2);
  });

  it('lean-only baseline is competitive: neither side locks 270 outside the toss-ups', () => {
    const evs = (pred: (lean: number) => boolean) =>
      STATE_LIST.filter((s) => pred(s.lean)).reduce((t, s) => t + s.electoralVotes, 0);
    const safeR = evs((l) => l > 3);
    const safeD = evs((l) => l < -3);
    const tossUp = evs((l) => Math.abs(l) <= 3);
    expect(safeR).toBeLessThan(ELECTORAL_VOTES_TO_WIN);
    expect(safeD).toBeLessThan(ELECTORAL_VOTES_TO_WIN);
    expect(tossUp).toBeGreaterThan(100);
  });
});

describe('derived state electorates', () => {
  it('every state’s 8 faction weights sum to 1 and are positive', () => {
    for (const s of STATE_LIST) {
      const e = deriveStateElectorate(s);
      const total = FACTION_IDS.reduce((t, f) => t + e[f].weight, 0);
      expect(total).toBeCloseTo(1, 9);
      for (const f of FACTION_IDS) expect(e[f].weight).toBeGreaterThan(0);
    }
  });

  it('coalition pools follow partisan lean', () => {
    for (const s of STATE_LIST) {
      const p = coalitionPools(s);
      if (s.lean > 0) expect(p.gop).toBeGreaterThan(p.dem);
      if (s.lean < 0) expect(p.dem).toBeGreaterThan(p.gop);
    }
  });

  it('demographic dials shape the within-coalition mix', () => {
    const wv = deriveStateElectorate(STATES.WV);
    const ca = deriveStateElectorate(STATES.CA);
    const mt = deriveStateElectorate(STATES.MT);
    const nj = deriveStateElectorate(STATES.NJ);
    // Rural WV: America First dominates the GOP pool more than in urban CA.
    const afShare = (e: typeof wv) =>
      e.r_america_first.weight / (e.r_america_first.weight + e.r_traditional_neocon.weight + e.r_establishment.weight);
    expect(afShare(wv)).toBeGreaterThan(afShare(ca));
    // Progressive hub: CA's Dem pool is more progressive than WV's.
    const progShare = (e: typeof wv) =>
      e.d_progressive.weight / (e.d_establishment.weight + e.d_progressive.weight + e.d_moderate.weight);
    expect(progShare(ca)).toBeGreaterThan(progShare(wv));
    // Libertarian streak: MT > NJ.
    expect(mt.libertarian_third.weight).toBeGreaterThan(nj.libertarian_third.weight);
  });

  it('applies state turnout culture', () => {
    expect(deriveStateElectorate(STATES.MN).independent.baseTurnout).toBeGreaterThan(
      deriveStateElectorate(STATES.OK).independent.baseTurnout,
    );
  });

  it('is deterministic', () => {
    expect(deriveStateElectorate(STATES.PA)).toEqual(deriveStateElectorate(STATES.PA));
  });
});

describe('senate', () => {
  it('classes have 33/33/34 seats and every state (not DC) appears exactly twice', () => {
    expect(SENATE_CLASSES[1].length).toBe(33);
    expect(SENATE_CLASSES[2].length).toBe(33);
    expect(SENATE_CLASSES[3].length).toBe(34);
    const counts = new Map<string, number>();
    for (const c of [1, 2, 3] as const) for (const s of SENATE_CLASSES[c]) counts.set(s, (counts.get(s) ?? 0) + 1);
    for (const code of STATE_CODES) expect(counts.get(code) ?? 0).toBe(code === 'DC' ? 0 : 2);
  });

  it('class 3 is up in 2028 and the cycle repeats every six years', () => {
    expect(classUpInYear(2028)).toBe(3);
    expect(classUpInYear(2030)).toBe(1);
    expect(classUpInYear(2032)).toBe(2);
    expect(classUpInYear(2034)).toBe(3);
    expect(classUpInYear(2029)).toBe(null);
  });

  it('opening Senate has 100 seats, 53 R – 47 D, matching the current chamber', () => {
    const seats = buildStartingSenate();
    expect(seats.length).toBe(100);
    expect(seats.filter((s) => s.holder === 'R').length).toBe(53);
  });
});

describe('archetypes', () => {
  it(`has exactly ${FEED_SIZE} with unique ids and handles`, () => {
    expect(ARCHETYPES.length).toBe(FEED_SIZE);
    expect(new Set(ARCHETYPE_IDS).size).toBe(FEED_SIZE);
    expect(new Set(ARCHETYPES.map((a) => a.handle)).size).toBe(FEED_SIZE);
  });

  it('handles match the feed schema regex', () => {
    for (const a of ARCHETYPES) expect(/^@\w{2,20}$/.test(a.handle)).toBe(true);
  });

  it('represents every faction, with at least 2 voices each', () => {
    for (const f of FACTION_IDS) {
      expect(ARCHETYPES.filter((a) => a.faction === f).length).toBeGreaterThanOrEqual(2);
    }
  });

  it('every voice has a cross-pressure (no caricatures) and valid sensitivities', () => {
    for (const a of ARCHETYPES) {
      expect(a.voice.crossPressure.length).toBeGreaterThan(10);
      for (const [metric, v] of Object.entries(a.metricSensitivity)) {
        expect((METRIC_IDS as readonly string[]).includes(metric)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    }
  });

  it('spans generations (ages 18–80, at least one under 30 and one over 65)', () => {
    const ages = ARCHETYPES.map((a) => a.age);
    expect(Math.min(...ages)).toBeLessThan(30);
    expect(Math.max(...ages)).toBeGreaterThan(65);
  });
});

describe('events', () => {
  it('has unique ids and positive weights', () => {
    expect(new Set(EVENTS.map((e) => e.id)).size).toBe(EVENTS.length);
    for (const e of EVENTS) expect(e.baseWeight).toBeGreaterThan(0);
  });

  it('includes both crises and good news', () => {
    expect(EVENTS.some((e) => e.severity >= 4)).toBe(true);
    expect(EVENTS.some((e) => e.severity === 1)).toBe(true);
  });

  it('multiplicative shocks are sane (0.5×–2×)', () => {
    for (const e of EVENTS) {
      for (const s of Object.values(e.metricShocks)) {
        if (s?.op === 'mult') {
          expect(s.value).toBeGreaterThan(0.5);
          expect(s.value).toBeLessThan(2);
        }
      }
    }
  });
});

describe('initial state', () => {
  it('opening metrics sit inside their bounds', () => {
    for (const m of METRIC_IDS) {
      expect(INITIAL_METRICS[m]).toBeGreaterThanOrEqual(METRIC_BOUNDS[m].min);
      expect(INITIAL_METRICS[m]).toBeLessThanOrEqual(METRIC_BOUNDS[m].max);
    }
  });
});
