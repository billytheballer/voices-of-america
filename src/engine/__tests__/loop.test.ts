import { describe, expect, it } from 'vitest';
import { STATE_CODES, HOUSE_SEATS, SENATE_SEATS } from '@/domain/constants';
import { STATES } from '@/data/states';
import { GAME_LOOP } from '@/data/balance.config';
import { EVENTS } from '@/data/events';
import { FACTIONS } from '@/data/factions';
import { shockFaction } from '../electorate/applyModifiers';
import { phaseFor, turnsUntilElection, nextQuarter } from '../loop/calendar';
import { difficultyShift, newGame, tippingPointShift } from '../loop/newGame';
import { billRejection, blameFactor, endTurn, submitBill } from '../loop/actions';
import { applyEvent } from '../events/eventTicker';
import { buildForecastInput } from '../loop/forecast';
import { houseCounts, senateCounts } from '../legislature/seatModel';
import type { GameState } from '../loop/types';
import { makeBill } from './fixtures';

const start = (overrides: Partial<Parameters<typeof newGame>[0]> = {}) =>
  newGame({ seed: 42, playerName: 'Alex Rivera', party: 'D', ...overrides });

/** Test helper: tilt every state so elections are foregone conclusions. */
const rig = (g: GameState, points: number): GameState => ({
  ...g,
  calibration: Object.fromEntries(STATE_CODES.map((s) => [s, g.calibration[s] + points])) as GameState['calibration'],
});

/** Keep the player's own party content, so these loop tests aren't decided by primaries. */
const pamper = (g: GameState): GameState => {
  let e = g.electorate;
  for (const f of ['d_establishment', 'd_progressive', 'd_moderate', 'r_america_first', 'r_traditional_neocon', 'r_establishment'] as const) {
    if (FACTIONS[f].homeParty === g.player.party) e = shockFaction(e, f, STATE_CODES, 1);
  }
  return { ...g, electorate: e };
};

const advance = (g: GameState, turns: number) => {
  let s = g;
  for (let i = 0; i < turns; i++) s = endTurn(pamper(s));
  return s;
};

/** Run until (year, quarter). */
function playUntil(g: GameState, year: number, quarter: number) {
  let s = g;
  while (!(s.year === year && s.quarter === quarter) && !s.gameOver) s = endTurn(pamper(s));
  return s;
}

describe('calendar', () => {
  it('maps quarters to phases', () => {
    expect(phaseFor(2028, 1, false)).toBe('primary');
    expect(phaseFor(2028, 1, true)).toBe('governing');
    expect(phaseFor(2028, 3, false)).toBe('general_campaign');
    expect(phaseFor(2028, 4, false)).toBe('general_election');
    expect(phaseFor(2029, 2, true)).toBe('governing');
    expect(phaseFor(2030, 3, true)).toBe('midterm_campaign');
    expect(phaseFor(2030, 4, true)).toBe('midterm_election');
  });

  it('counts turns to the next election', () => {
    expect(turnsUntilElection(2028, 1)).toBe(3);
    expect(turnsUntilElection(2028, 4)).toBe(0);
    expect(turnsUntilElection(2029, 1)).toBe(7);
  });

  it('rolls over the year', () => {
    expect(nextQuarter(2028, 4)).toEqual({ year: 2029, quarter: 1 });
  });
});

describe('newGame', () => {
  it('opens in the 2028 primary with the inherited Congress and an opening event', () => {
    const g = start();
    expect(g.year).toBe(2028);
    expect(g.phase).toBe('primary');
    expect(g.player.isPresident).toBe(false);
    expect(g.incumbentParty).toBe(GAME_LOOP.openingIncumbentParty);
    expect(EVENTS.some((e) => e.id === g.currentEventId)).toBe(true);
    const h = houseCounts(g.congress, 'D');
    expect(h.player + h.opposition).toBe(HOUSE_SEATS);
  });

  it('is deterministic for a seed', () => {
    expect(start()).toEqual(start());
    expect(start({ seed: 1 }).currentEventId === start({ seed: 2 }).currentEventId &&
      start({ seed: 1 }).rngState === start({ seed: 2 }).rngState).toBe(false);
  });

  it('balanced difficulty puts the tipping-point state at a dead heat', () => {
    const shift = difficultyShift('balanced', 'D');
    const margins = Object.fromEntries(STATE_CODES.map((s) => [s, -STATES[s].lean + shift])) as Record<
      (typeof STATE_CODES)[number],
      number
    >;
    expect(tippingPointShift(margins)).toBeCloseTo(0, 9);
    expect(shift).toBeGreaterThan(0); // Democrats get help vs. the realistic map
    expect(difficultyShift('hard', 'D')).toBeCloseTo(shift - 3, 9);
    expect(difficultyShift('realistic', 'D')).toBe(0);
  });
});

describe('bills', () => {
  it('only a sitting president can legislate, and not on election day', () => {
    const g = start();
    expect(billRejection(g, makeBill())).toBe('not_president');
    const prez: GameState = { ...g, player: { ...g.player, isPresident: true }, phase: 'governing' };
    expect(billRejection(prez, makeBill())).toBe(null);
    expect(billRejection({ ...prez, phase: 'midterm_election' }, makeBill())).toBe('wrong_phase');
  });

  it('enforces capital and the per-turn limit', () => {
    const g: GameState = { ...start(), player: { ...start().player, isPresident: true }, phase: 'governing', politicalCapital: 10 };
    expect(billRejection(g, makeBill({ radical_score: 8 }))).toBe('insufficient_capital');
    const after = submitBill(g, makeBill({ radical_score: 2 })).state;
    expect(after.politicalCapital).toBe(5);
    expect(billRejection(after, makeBill({ radical_score: 2 }))).toBe('bill_limit_reached');
  });

  it('an enacted bill changes the electorate, metrics and platform', () => {
    const g: GameState = {
      ...start(),
      player: { ...start().player, isPresident: true },
      phase: 'governing',
      politicalCapital: 100,
      incumbentParty: 'D',
    };
    const bill = makeBill({
      instrument: 'executive_order',
      modifiers: { independent: 6 },
      policy_vector: { ...makeBill().policy_vector, economic: -6 },
      metric_impacts: { ...makeBill().metric_impacts, inflation: { direction: 'down', magnitude: 'moderate' } },
    });
    const r = submitBill(g, bill);
    expect(r.outcome.status).toBe('executive_order_upheld');
    expect(r.state.electorate.AZ.independent.satisfaction).toBeGreaterThan(g.electorate.AZ.independent.satisfaction);
    expect(r.state.metrics.inflation).toBeLessThan(g.metrics.inflation);
    expect(r.state.playerPlatform.economic).toBeLessThan(g.playerPlatform.economic);
    expect(r.effects.length).toBeGreaterThan(0);
  });
});

describe('endTurn', () => {
  it('advances a quarter, draws a new event, and logs the turn', () => {
    const g = start();
    const n = endTurn(g);
    expect(n.quarter).toBe(2);
    expect(n.turn).toBe(1);
    expect(n.log.length).toBe(1);
    expect(n.log[0]!.turn).toBe(0);
    expect(n.rngState).not.toBe(g.rngState);
  });

  it('replays bit-for-bit: same seed + same actions = same game', () => {
    expect(advance(start(), 12)).toEqual(advance(start(), 12));
  });

  it('opening the forecast never changes the future', () => {
    const g = start();
    buildForecastInput(g, 100);
    expect(endTurn(g)).toEqual(endTurn(start()));
  });

  it('forecast input targets the next election with Congress attached', () => {
    const f = buildForecastInput(start(), 100);
    expect(f.kind).toBe('presidential');
    expect(f.horizonTurns).toBe(3);
    expect(f.congress!.senateRaces.length).toBe(34);
  });
});

describe('the full loop', () => {
  it('a dominant player wins twice, survives midterms, then hands off to a successor', () => {
    let g = rig(start(), 40);
    g = playUntil(g, 2029, 1);
    expect(g.player.isPresident).toBe(true);
    expect(g.player.termsServed).toBe(1);
    expect(g.incumbentParty).toBe('D');
    expect(g.phase).toBe('governing');
    expect(g.politicalCapital).toBeGreaterThanOrEqual(GAME_LOOP.inaugurationCapital - 1);
    expect(g.elections.at(-1)!.won).toBe(true);

    g = playUntil(g, 2031, 1);
    expect(g.elections.at(-1)!.kind).toBe('midterm');

    g = playUntil(g, 2033, 1);
    expect(g.player.termsServed).toBe(2);

    g = playUntil(g, 2036, 1);
    expect(g.player.generation).toBe(1);
    expect(g.player.termsServed).toBe(0);
    expect(g.player.isPresident).toBe(false);
    expect(g.player.name).toBe('Alex Rivera (Successor 1)');
    expect(g.phase).toBe('primary');
    expect(g.incumbentParty).toBe('D'); // the party still holds the White House

    g = playUntil(g, 2037, 1);
    expect(g.player.isPresident).toBe(true);
    expect(g.gameOver).toBe(null);
    expect(g.elections.filter((e) => e.kind === 'presidential').length).toBe(3);
  });

  it('Congress stays well-formed through elections', () => {
    const g = playUntil(rig(start(), 40), 2031, 1);
    const h = houseCounts(g.congress, 'D');
    const s = senateCounts(g.congress, 'D');
    expect(h.player + h.opposition).toBe(HOUSE_SEATS);
    expect(s.player + s.opposition).toBe(SENATE_SEATS);
    expect(h.player).toBeGreaterThan(300);
  });

  it('losing the presidency ends the game', () => {
    const g = playUntil(rig(start(), -40), 2029, 1);
    expect(g.gameOver).toEqual({ reason: 'lost_presidency', year: 2028 });
    expect(g.phase).toBe('game_over');
    expect(endTurn(g)).toBe(g);
  });

  it('voters blame the White House for bad metrics', () => {
    const base = start();
    const crisis = { ...base, metrics: { ...base.metrics, inflation: 9 } };
    const asChallenger = endTurn({ ...crisis, incumbentParty: 'R' });
    const asIncumbent = endTurn({ ...crisis, incumbentParty: 'D' });
    expect(asChallenger.electorate.AZ.independent.satisfaction).toBeGreaterThan(
      asIncumbent.electorate.AZ.independent.satisfaction,
    );
  });

  it('a hands-off player is not doomed by drift alone (approval stays bounded over 15 years)', () => {
    const base = start();
    let g: GameState = { ...base, player: { ...base.player, isPresident: true }, incumbentParty: 'D' };
    let min = 1;
    let max = 0;
    for (let i = 0; i < 60 && !g.gameOver; i++) {
      g = endTurn(rig(g, 0));
      const a = g.log.at(-1)!.approval;
      min = Math.min(min, a);
      max = Math.max(max, a);
    }
    expect(min).toBeGreaterThan(0.3);
    expect(max).toBeLessThan(0.7);
  });

  it('events hurt the incumbent and help the challenger', () => {
    const hurricane = EVENTS.find((e) => e.id === 'gulf_hurricane')!;
    const base = start();
    const asIncumbent = applyEvent(hurricane, base.metrics, base.electorate, blameFactor({ ...base, incumbentParty: 'D' }));
    const asChallenger = applyEvent(hurricane, base.metrics, base.electorate, blameFactor({ ...base, incumbentParty: 'R' }));
    expect(asIncumbent.electorate.LA.independent.satisfaction).toBeLessThan(base.electorate.LA.independent.satisfaction);
    expect(asChallenger.electorate.LA.independent.satisfaction).toBeGreaterThan(base.electorate.LA.independent.satisfaction);
  });

  it('keeps the log bounded', () => {
    const g = advance(rig(start(), 40), GAME_LOOP.logLimit + 10);
    expect(g.log.length).toBe(GAME_LOOP.logLimit);
  });
});
