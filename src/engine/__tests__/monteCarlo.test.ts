import { describe, expect, it } from 'vitest';
import { STATE_CODES } from '@/domain/constants';
import { FACTION_LIST } from '@/data/factions';
import { STATES } from '@/data/states';
import type { Party, StateCode } from '@/domain/types';
import { computePartyAnchor, opposingParty } from '../opposition/reactiveBaseline';
import { buildInitialElectorate } from '../electorate/initElectorate';
import { calibrateStates } from '../electorate/voteShare';
import { buildElectoralUnits, buildSimulationInput } from '../simulation/prepare';
import { prepare, runMonteCarlo, runMonteCarloChunked, simulateRun } from '../simulation/monteCarlo';
import { percentile, tippingPointIndex } from '../simulation/aggregate';
import type { SimulationInput } from '../simulation/types';
import { createRng } from '../rng';
import type { ElectionContext } from '../types';

const BASE = buildInitialElectorate();

function inputFor(party: Party, opts: { runs?: number; seed?: number; horizonTurns?: number; shift?: number } = {}) {
  const ctx: ElectionContext = {
    playerParty: party,
    playerPlatform: computePartyAnchor(party, FACTION_LIST),
    oppositionPlatform: computePartyAnchor(opposingParty(party), FACTION_LIST),
    isMidterm: false,
    incumbentParty: null,
  };
  const input = buildSimulationInput(BASE, ctx, calibrateStates(BASE, party), {
    seed: opts.seed ?? 2028,
    runs: opts.runs ?? 4_000,
    horizonTurns: opts.horizonTurns ?? 0,
  });
  if (opts.shift) {
    for (const s of STATE_CODES) input.stateMargins[s] += opts.shift;
  }
  return input;
}

function correlation(input: SimulationInput, a: StateCode, b: StateCode, n = 4_000) {
  const p = prepare(input);
  const rng = createRng(1);
  const ia = STATE_CODES.indexOf(a);
  const ib = STATE_CODES.indexOf(b);
  const xs: number[] = [];
  const ys: number[] = [];
  for (let i = 0; i < n; i++) {
    const r = simulateRun(p, rng);
    xs.push(r.stateMargins[ia]!);
    ys.push(r.stateMargins[ib]!);
  }
  const mx = xs.reduce((s, x) => s + x, 0) / n;
  const my = ys.reduce((s, y) => s + y, 0) / n;
  let cov = 0, vx = 0, vy = 0;
  for (let i = 0; i < n; i++) {
    cov += (xs[i]! - mx) * (ys[i]! - my);
    vx += (xs[i]! - mx) ** 2;
    vy += (ys[i]! - my) ** 2;
  }
  return cov / Math.sqrt(vx * vy);
}

describe('Monte Carlo: basics', () => {
  const result = runMonteCarlo(inputFor('D'));

  it('is deterministic for a given seed', () => {
    expect(runMonteCarlo(inputFor('D', { runs: 1_000 }))).toEqual(runMonteCarlo(inputFor('D', { runs: 1_000 })));
    expect(runMonteCarlo(inputFor('D', { runs: 1_000, seed: 1 })).winProbability).not.toBe(
      runMonteCarlo(inputFor('D', { runs: 1_000, seed: 2 })).winProbability,
    );
  });

  it('probabilities and histogram are consistent', () => {
    expect(result.winProbability + result.tieProbability + result.lossProbability).toBeCloseTo(1, 9);
    expect(result.electoralVotes.histogram.length).toBe(539);
    expect(result.electoralVotes.histogram.reduce((a, b) => a + b, 0)).toBe(result.runs);
    expect(result.electoralVotes.p5).toBeLessThanOrEqual(result.electoralVotes.median);
    expect(result.electoralVotes.median).toBeLessThanOrEqual(result.electoralVotes.p95);
  });

  it('opening race is competitive with the expected Electoral College tilt toward the GOP', () => {
    expect(result.winProbability).toBeGreaterThan(0.1);
    expect(result.winProbability).toBeLessThan(0.55);
    const asR = runMonteCarlo(inputFor('R'));
    expect(asR.winProbability).toBeGreaterThan(result.winProbability);
  });

  it('a uniform swing moves the odds decisively', () => {
    expect(runMonteCarlo(inputFor('D', { shift: 8 })).winProbability).toBeGreaterThan(0.9);
    expect(runMonteCarlo(inputFor('D', { shift: -8 })).winProbability).toBeLessThan(0.05);
  });

  it('safe states are safe and swing states swing', () => {
    expect(result.states.CA.winProbability).toBeGreaterThan(0.99);
    expect(result.states.WY.winProbability).toBeLessThan(0.01);
    expect(result.states.PA.winProbability).toBeGreaterThan(0.2);
    expect(result.states.PA.winProbability).toBeLessThan(0.8);
  });

  it('popular-vote stats are sane', () => {
    expect(result.popularVoteWinProbability).toBeGreaterThan(0.2);
    expect(result.splitProbability).toBeGreaterThanOrEqual(0);
    expect(result.splitProbability).toBeLessThan(0.5);
    expect(result.popularVote.p5Margin).toBeLessThan(result.popularVote.p95Margin);
  });
});

describe('Monte Carlo: correlated error', () => {
  const input = inputFor('D');

  it('same-region states move together more than cross-region states', () => {
    expect(correlation(input, 'MI', 'WI')).toBeGreaterThan(correlation(input, 'MI', 'AZ'));
  });

  it('all states share a national component (positive correlation everywhere)', () => {
    expect(correlation(input, 'PA', 'NV')).toBeGreaterThan(0.2);
  });

  it('battleground flips cluster: P(lose PA ∧ lose WI) > P(lose PA)·P(lose WI)', () => {
    const p = prepare(input);
    const rng = createRng(3);
    const ipa = STATE_CODES.indexOf('PA');
    const iwi = STATE_CODES.indexOf('WI');
    let a = 0, b = 0, both = 0;
    const n = 5_000;
    for (let i = 0; i < n; i++) {
      const r = simulateRun(p, rng);
      const lpa = r.stateMargins[ipa]! < 0;
      const lwi = r.stateMargins[iwi]! < 0;
      if (lpa) a++;
      if (lwi) b++;
      if (lpa && lwi) both++;
    }
    expect(both / n).toBeGreaterThan((a / n) * (b / n) + 0.05);
  });
});

describe('Monte Carlo: turnout surprises', () => {
  it('progressive turnout helps a Dem most in progressive hubs; America First turnout hurts', () => {
    const input = inputFor('D');
    expect(input.turnoutSensitivity.CA.d_progressive).toBeGreaterThan(0);
    expect(input.turnoutSensitivity.CA.d_progressive).toBeGreaterThan(input.turnoutSensitivity.WV.d_progressive);
    expect(input.turnoutSensitivity.OH.r_america_first).toBeLessThan(0);
  });

  it('flips sign with the player’s party', () => {
    expect(inputFor('R').turnoutSensitivity.OH.r_america_first).toBeGreaterThan(0);
  });
});

describe('Monte Carlo: horizon, districts, tipping point', () => {
  it('uncertainty widens further from election day', () => {
    const near = runMonteCarlo(inputFor('D', { horizonTurns: 0 }));
    const far = runMonteCarlo(inputFor('D', { horizonTurns: 12 }));
    expect(far.electoralVotes.p95 - far.electoralVotes.p5).toBeGreaterThan(
      near.electoralVotes.p95 - near.electoralVotes.p5,
    );
  });

  it('splits Maine and Nebraska by district, keeping 538 total EVs', () => {
    const units = buildElectoralUnits('D');
    expect(units.reduce((s, u) => s + u.electoralVotes, 0)).toBe(538);
    const r = runMonteCarlo(inputFor('D'));
    expect(r.districts['NE-3']!.winProbability).toBeLessThan(0.01);
    expect(r.districts['NE-2']!.winProbability).toBeGreaterThan(r.districts['NE-1']!.winProbability);
  });

  it('tipping points are battleground states', () => {
    const r = runMonteCarlo(inputFor('D'));
    const total = r.tippingPoints.reduce((s, t) => s + t.probability, 0);
    expect(total).toBeLessThanOrEqual(1);
    for (const t of r.tippingPoints.slice(0, 4)) {
      const code = t.unitId.slice(0, 2) as StateCode;
      expect(Math.abs(STATES[code].lean)).toBeLessThanOrEqual(4);
    }
  });

  it('tippingPointIndex finds the unit that delivers the 270th EV', () => {
    const units = [
      { id: 'A', state: 'CA', region: 'pacific', electoralVotes: 200, offset: 0, isDistrict: false },
      { id: 'B', state: 'TX', region: 'southwest', electoralVotes: 100, offset: 0, isDistrict: false },
      { id: 'C', state: 'FL', region: 'southeast', electoralVotes: 238, offset: 0, isDistrict: false },
    ] as const;
    const margins = Float64Array.from([10, 2, -5]);
    expect(tippingPointIndex([...units], margins, 300, [0, 1, 2])).toBe(1);
  });
});

describe('Monte Carlo: chunked runner + performance', () => {
  it('chunked runner yields progress and matches the sync result exactly', async () => {
    const input = inputFor('R', { runs: 2_000 });
    const gen = runMonteCarloChunked(input);
    let snapshots = 0;
    let step = await gen.next();
    while (!step.done) {
      snapshots++;
      expect(step.value.completedRuns).toBeLessThan(2_000);
      step = await gen.next();
    }
    expect(snapshots).toBe(3); // 2000 / 500 = 4 chunks → 3 interim snapshots
    expect(step.value).toEqual(runMonteCarlo(input));
  });

  it('runs 10,000 simulations in well under 2 seconds', () => {
    const input = inputFor('D', { runs: 10_000 });
    const t0 = performance.now();
    runMonteCarlo(input);
    expect(performance.now() - t0).toBeLessThan(2_000);
  });

  it('percentile interpolates', () => {
    expect(percentile([0, 10], 0.5)).toBe(5);
    expect(percentile([1, 2, 3], 0)).toBe(1);
  });
});
