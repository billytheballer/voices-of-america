import { describe, expect, it } from 'vitest';
import { STATE_CODES } from '@/domain/constants';
import { FACTION_LIST } from '@/data/factions';
import type { Party } from '@/domain/types';
import { computePartyAnchor, opposingParty } from '../opposition/reactiveBaseline';
import { buildInitialElectorate } from '../electorate/initElectorate';
import { calibrateStates } from '../electorate/voteShare';
import { buildCongressSimInput, buildSimulationInput } from '../simulation/prepare';
import { prepare, resolveElection, runMonteCarlo, simulateRun } from '../simulation/monteCarlo';
import { buildStartingCongress } from '../legislature/seatModel';
import { createRng } from '../rng';
import type { ElectionContext } from '../types';

const BASE = buildInitialElectorate();
const CONGRESS = buildStartingCongress();

function input(
  party: Party,
  opts: { year?: number; kind?: 'presidential' | 'midterm'; incumbent?: Party | null; shift?: number; runs?: number } = {},
) {
  const ctx: ElectionContext = {
    playerParty: party,
    playerPlatform: computePartyAnchor(party, FACTION_LIST),
    oppositionPlatform: computePartyAnchor(opposingParty(party), FACTION_LIST),
    isMidterm: opts.kind === 'midterm',
    incumbentParty: opts.incumbent ?? null,
  };
  const i = buildSimulationInput(BASE, ctx, calibrateStates(BASE, party), {
    seed: 7,
    runs: opts.runs ?? 4_000,
    kind: opts.kind ?? 'presidential',
    congress: buildCongressSimInput(CONGRESS, opts.year ?? 2028, party),
  });
  if (opts.shift) for (const s of STATE_CODES) i.stateMargins[s] += opts.shift;
  return i;
}

describe('Congress in the Monte Carlo', () => {
  const r = runMonteCarlo(input('D'));
  const c = r.congress!;

  it('reports House and Senate distributions', () => {
    expect(c.house.histogram.length).toBe(436);
    expect(c.senate.histogram.length).toBe(101);
    expect(c.house.histogram.reduce((a, b) => a + b, 0)).toBe(r.runs);
    expect(c.house.p5).toBeLessThanOrEqual(c.house.p95);
  });

  it('Senate seats stay between holdovers and holdovers + seats up', () => {
    const ci = input('D').congress!;
    const min = ci.senateHoldovers.player;
    const max = min + ci.senateRaces.length;
    c.senate.histogram.forEach((count, seats) => {
      if (count > 0) {
        expect(seats).toBeGreaterThanOrEqual(min);
        expect(seats).toBeLessThanOrEqual(max);
      }
    });
    expect(Object.keys(c.senateRaces).length).toBe(34);
  });

  it('opening House control is genuinely contested', () => {
    expect(c.house.majorityProbability).toBeGreaterThan(0.1);
    expect(c.house.majorityProbability).toBeLessThan(0.9);
  });

  it('a wave election sweeps Congress', () => {
    const wave = runMonteCarlo(input('D', { shift: 8 })).congress!;
    expect(wave.house.majorityProbability).toBeGreaterThan(0.95);
    expect(wave.senate.mean).toBeGreaterThan(c.senate.mean + 2);
  });

  it('coattails: P(House majority | win White House) > P(House majority)', () => {
    const p = prepare(input('D'));
    const rng = createRng(2);
    let wins = 0, maj = 0, both = 0;
    const n = 4_000;
    for (let i = 0; i < n; i++) {
      const run = simulateRun(p, rng);
      const w = run.playerEV >= 270;
      const m = run.houseSeats >= 218;
      if (w) wins++;
      if (m) maj++;
      if (w && m) both++;
    }
    expect(both / wins).toBeGreaterThan(maj / n + 0.1);
  });

  it('midterms: a 50–50 Senate goes to the White House party via the VP', () => {
    // Same electorate and margins; only the tie-breaker changes.
    const asIncumbent = input('R', { year: 2030, kind: 'midterm', incumbent: 'R' });
    const asChallenger = { ...asIncumbent, incumbentParty: 'D' as const };
    const a = runMonteCarlo(asIncumbent).congress!;
    const b = runMonteCarlo(asChallenger).congress!;
    const fifty = a.senate.histogram[50]! / asIncumbent.runs;
    expect(fifty).toBeGreaterThan(0);
    expect(a.senate.majorityProbability - b.senate.majorityProbability).toBeCloseTo(fifty, 9);
  });

  it('presidency-only simulations are unchanged by the Congress module', () => {
    const i = input('D', { runs: 500 });
    const { congress: _drop, ...noCongress } = i;
    expect(runMonteCarlo(noCongress).congress).toBe(undefined);
  });

  it('election night is a deterministic single realization', () => {
    const i = input('R');
    const a = resolveElection(i, createRng(99));
    const b = resolveElection(i, createRng(99));
    expect(a.playerEV).toBe(b.playerEV);
    expect(a.houseSeats).toBe(b.houseSeats);
    expect(Array.from(a.senateRaceWins)).toEqual(Array.from(b.senateRaceWins));
  });
});
