import { STATE_CODES } from '@/domain/constants';
import type { Party, StateCode } from '@/domain/types';
import { STATES } from '@/data/states';
import { SEAT_MODEL } from '@/data/balance.config';
import { buildStartingSenate, classUpInYear, type SenateSeat } from '@/data/senateClasses';
import type { Rng } from '../rng';
import type { ChamberCounts, CongressState } from './types';

const other = (p: Party): Party => (p === 'R' ? 'D' : 'R');

/**
 * Seat–vote curve: s/(1−s) = (v/(1−v))^ρ. Winning 55% of a state's House vote
 * wins well over 55% of its seats, because districts are winner-take-all.
 */
export function seatShare(twoPartyVoteShare: number, rho = SEAT_MODEL.houseRho): number {
  const v = Math.min(0.999, Math.max(0.001, twoPartyVoteShare));
  const odds = Math.pow(v / (1 - v), rho);
  return odds / (1 + odds);
}

/** Margin in points → approximate two-party vote share. */
export const marginToShare = (margin: number) => 0.5 + margin / 200;

/** Expected (fractional) player seats per state. */
export function expectedHouseSeats(stateMargins: Record<StateCode, number>): Record<StateCode, number> {
  const out = {} as Record<StateCode, number>;
  for (const s of STATE_CODES) out[s] = STATES[s].houseSeats * seatShare(marginToShare(stateMargins[s]));
  return out;
}

/** Integer seats per state, rounded so the national total matches the rounded expectation (largest remainder). */
export function apportionHouse(stateMargins: Record<StateCode, number>): Record<StateCode, number> {
  const expected = expectedHouseSeats(stateMargins);
  const floors = {} as Record<StateCode, number>;
  let total = 0;
  let target = 0;
  for (const s of STATE_CODES) {
    floors[s] = Math.floor(expected[s]);
    total += floors[s];
    target += expected[s];
  }
  const remaining = Math.round(target) - total;
  const byRemainder = [...STATE_CODES].sort((a, b) => expected[b] - floors[b] - (expected[a] - floors[a]));
  for (let i = 0; i < remaining; i++) floors[byRemainder[i]!]!++;
  return floors;
}

/** One stochastic realization of a state's House seats (for Monte Carlo / election night). */
export function sampleStateHouseSeats(rng: Rng, seats: number, margin: number): number {
  const exp = seats * seatShare(marginToShare(margin));
  const base = Math.floor(exp);
  return base + (rng.next() < exp - base ? 1 : 0);
}

/** Senate race margin (player perspective) before candidate noise: state margin + incumbency. */
export function senateBaseMargin(stateMargin: number, holder: Party, playerParty: Party, cfg = SEAT_MODEL): number {
  return stateMargin + (holder === playerParty ? cfg.senateIncumbency : -cfg.senateIncumbency);
}

// ---------------------------------------------------------------------------
// Congress state helpers
// ---------------------------------------------------------------------------

export function houseCounts(c: CongressState, playerParty: Party): ChamberCounts {
  let player = 0;
  let opposition = 0;
  for (const s of STATE_CODES) {
    player += c.house[s][playerParty];
    opposition += c.house[s][other(playerParty)];
  }
  return { player, opposition };
}

export function senateCounts(c: CongressState, playerParty: Party): ChamberCounts {
  const player = c.senate.filter((x) => x.holder === playerParty).length;
  return { player, opposition: c.senate.length - player };
}

/**
 * Starting Congress: the actual Senate (see data/senateClasses.ts) and a House
 * apportioned from each state's lean. This is the "inherited baseline" the
 * player works with until the first election.
 */
export function buildStartingCongress(): CongressState {
  const rMargins = Object.fromEntries(STATE_CODES.map((s) => [s, STATES[s].lean])) as Record<StateCode, number>;
  const rSeats = apportionHouse(rMargins);
  const house = {} as CongressState['house'];
  for (const s of STATE_CODES) house[s] = { R: rSeats[s], D: STATES[s].houseSeats - rSeats[s] };
  return { house, senate: buildStartingSenate() };
}

/** Seats up for election this year, with current holders. */
export function seatsUp(c: CongressState, year: number): SenateSeat[] {
  const cls = classUpInYear(year);
  return cls === null ? [] : c.senate.filter((x) => x.senateClass === cls);
}
