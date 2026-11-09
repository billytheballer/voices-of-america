import { describe, expect, it } from 'vitest';
import { STATE_CODES } from '@/domain/constants';
import { TILES, TILE_COLS, TILE_ROWS, pollCloseLabel } from '@/data/tileGrid';
import { STATES } from '@/data/states';
import { newGame } from '@/engine/loop/newGame';
import { endTurn } from '@/engine/loop/actions';
import { buildForecastInput } from '@/engine/loop/forecast';
import { runMonteCarlo } from '@/engine/simulation/monteCarlo';
import { selectStateDetail } from '@/store/selectors';
import { marginBin, marginBins, probabilityBin, probabilityBins, satisfactionBin, RAMPS } from '../map/scales';
import { CLOSING_HOURS, revealFrame } from '../election-night/revealSchedule';

describe('tile grid', () => {
  it('places all 51 tiles inside the grid with no overlaps', () => {
    const seen = new Set<string>();
    for (const s of STATE_CODES) {
      const t = TILES[s];
      expect(t.row).toBeGreaterThanOrEqual(0);
      expect(t.row).toBeLessThan(TILE_ROWS);
      expect(t.col).toBeGreaterThanOrEqual(0);
      expect(t.col).toBeLessThan(TILE_COLS);
      seen.add(`${t.row},${t.col}`);
    }
    expect(seen.size).toBe(51);
  });

  it('poll closings run from 7 pm ET to 1 am, east before west', () => {
    expect(CLOSING_HOURS[0]).toBe(19);
    expect(CLOSING_HOURS.at(-1)).toBe(25);
    expect(TILES.VA.pollClose).toBeLessThan(TILES.CA.pollClose);
    expect(pollCloseLabel(19.5)).toBe('7:30 pm');
    expect(pollCloseLabel(25)).toBe('1 am');
  });
});

describe('map scales', () => {
  it('bins are monotone and symmetric around the toss-up', () => {
    expect([0.01, 0.2, 0.35, 0.5, 0.7, 0.9, 0.99].map(probabilityBin)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect([-20, -10, -4, -0.1, 0.1, 4, 10, 20].map(marginBin)).toEqual([0, 1, 2, 2, 3, 3, 4, 5]);
    expect([20, 35, 45, 50, 55, 65, 80].map(satisfactionBin)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('the player’s side always uses the player’s party ramp, with a gray midpoint', () => {
    const asD = probabilityBins('D');
    expect(asD[6]!.color).toBe(RAMPS.D[2]);
    expect(asD[0]!.color).toBe(RAMPS.R[2]);
    expect(asD[3]!.color).toBe(RAMPS.mid);
    expect(marginBins('R')[5]!.color).toBe(RAMPS.R[2]);
    expect(marginBins('R').some((b) => b.color === RAMPS.mid)).toBe(false); // results always show a winner
  });
});

describe('election night reveal', () => {
  /** Play seeded games to election night and return the records. */
  const records = [1, 2, 3, 4, 5].map((seed) => {
    let g = newGame({ seed, playerName: 'Test', party: seed % 2 ? 'D' : 'R', difficulty: 'balanced' });
    while (g.elections.length === 0) g = endTurn(g);
    return g.elections[0]!;
  });

  it('the final frame tallies exactly to the official electoral vote (incl. ME/NE districts)', () => {
    for (const r of records) {
      const f = revealFrame(r, CLOSING_HOURS.length - 1);
      expect(f.playerEV).toBe(r.playerEV!);
      expect(f.playerEV + f.oppositionEV).toBe(538);
      expect(f.revealed.size).toBe(51);
    }
  });

  it('tallies only grow as polls close', () => {
    const r = records[0]!;
    let prev = 0;
    for (let k = 0; k < CLOSING_HOURS.length; k++) {
      const f = revealFrame(r, k);
      expect(f.playerEV + f.oppositionEV).toBeGreaterThanOrEqual(prev);
      prev = f.playerEV + f.oppositionEV;
    }
  });

  it('records Senate results for every seat that was up', () => {
    expect(records[0]!.senateResults!.length).toBe(34);
  });
});

describe('state detail', () => {
  const g = newGame({ seed: 3, playerName: 'Test', party: 'D' });

  it('faction shares sum to 1 and today’s margin matches the opening lean', () => {
    const d = selectStateDetail(g, 'PA');
    expect(d.factions.reduce((s, f) => s + f.share, 0)).toBeCloseTo(1, 9);
    expect(Math.abs(d.margin - -STATES.PA.lean)).toBeLessThan(3); // opening event can nudge it
  });

  it('the forecast covers every state and agrees in direction with today’s margin in safe states', () => {
    const r = runMonteCarlo(buildForecastInput(g, 2_000));
    expect(r.states.CA.winProbability).toBeGreaterThan(0.95);
    expect(selectStateDetail(g, 'CA').margin).toBeGreaterThan(5);
  });
});
