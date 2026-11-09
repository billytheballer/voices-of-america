import type { StateCode } from '@/domain/types';

/**
 * Equal-area tile map. Every state gets one tile, so small states are as
 * visible (and clickable) as large ones, and area doesn't mislead the way a
 * geographic choropleth does. Layout follows the familiar newsroom tile-grid
 * convention: rows top→bottom, columns west→east.
 *
 * `pollClose` is the (approximate, simplified) hour, Eastern Time, at which the
 * state's last polls close. It drives the election-night reveal order.
 */
export interface Tile {
  row: number;
  col: number;
  /** 24-hour ET, e.g. 19.5 = 7:30 pm. 25 = 1 am the next morning. */
  pollClose: number;
}

export const TILE_COLS = 12;
export const TILE_ROWS = 8;

// prettier-ignore
export const TILES: Record<StateCode, Tile> = {
  AK: { row: 0, col: 0, pollClose: 25 },   ME: { row: 0, col: 11, pollClose: 20 },
  WI: { row: 1, col: 6, pollClose: 21 },   VT: { row: 1, col: 10, pollClose: 19 },   NH: { row: 1, col: 11, pollClose: 20 },
  WA: { row: 2, col: 1, pollClose: 23 },   ID: { row: 2, col: 2, pollClose: 23 },    MT: { row: 2, col: 3, pollClose: 22 },
  ND: { row: 2, col: 4, pollClose: 21 },   MN: { row: 2, col: 5, pollClose: 21 },    IL: { row: 2, col: 6, pollClose: 20 },
  MI: { row: 2, col: 7, pollClose: 21 },   NY: { row: 2, col: 9, pollClose: 21 },    MA: { row: 2, col: 10, pollClose: 20 },
  OR: { row: 3, col: 1, pollClose: 23 },   NV: { row: 3, col: 2, pollClose: 22 },    WY: { row: 3, col: 3, pollClose: 21 },
  SD: { row: 3, col: 4, pollClose: 21 },   IA: { row: 3, col: 5, pollClose: 22 },    IN: { row: 3, col: 6, pollClose: 19 },
  OH: { row: 3, col: 7, pollClose: 19.5 }, PA: { row: 3, col: 8, pollClose: 20 },    NJ: { row: 3, col: 9, pollClose: 20 },
  CT: { row: 3, col: 10, pollClose: 20 },  RI: { row: 3, col: 11, pollClose: 20 },
  CA: { row: 4, col: 1, pollClose: 23 },   UT: { row: 4, col: 2, pollClose: 22 },    CO: { row: 4, col: 3, pollClose: 21 },
  NE: { row: 4, col: 4, pollClose: 21 },   MO: { row: 4, col: 5, pollClose: 20 },    KY: { row: 4, col: 6, pollClose: 19 },
  WV: { row: 4, col: 7, pollClose: 19.5 }, VA: { row: 4, col: 8, pollClose: 19 },    MD: { row: 4, col: 9, pollClose: 20 },
  DE: { row: 4, col: 10, pollClose: 20 },
  AZ: { row: 5, col: 2, pollClose: 21 },   NM: { row: 5, col: 3, pollClose: 21 },    KS: { row: 5, col: 4, pollClose: 21 },
  AR: { row: 5, col: 5, pollClose: 20.5 }, TN: { row: 5, col: 6, pollClose: 20 },    NC: { row: 5, col: 7, pollClose: 19.5 },
  SC: { row: 5, col: 8, pollClose: 19 },   DC: { row: 5, col: 9, pollClose: 20 },
  OK: { row: 6, col: 4, pollClose: 20 },   LA: { row: 6, col: 5, pollClose: 21 },    MS: { row: 6, col: 6, pollClose: 20 },
  AL: { row: 6, col: 7, pollClose: 20 },   GA: { row: 6, col: 8, pollClose: 19 },
  HI: { row: 7, col: 0, pollClose: 24 },   TX: { row: 7, col: 4, pollClose: 21 },    FL: { row: 7, col: 9, pollClose: 20 },
};

/** "7:30 pm" style label for a poll-closing hour. */
export function pollCloseLabel(hour: number): string {
  const h = Math.floor(hour) % 24;
  const m = Math.round((hour - Math.floor(hour)) * 60);
  const suffix = h >= 12 ? 'pm' : 'am';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${suffix}`;
}
