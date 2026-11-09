import type { Party, StateCode } from '@/domain/types';
import { STATES } from './states';

/**
 * Senate classes. Class N is up in years where (year - CLASS_ANCHOR[N]) % 6 === 0.
 *   Class 1: 2024, 2030, 2036…   Class 2: 2026, 2032…   Class 3: 2028, 2034…
 * Every state belongs to exactly two classes (DC has no senators).
 */
export type SenateClass = 1 | 2 | 3;

export const CLASS_ANCHOR_YEAR: Record<SenateClass, number> = { 1: 2024, 2: 2026, 3: 2028 };

// prettier-ignore
export const SENATE_CLASSES: Record<SenateClass, StateCode[]> = {
  1: ['AZ','CA','CT','DE','FL','HI','IN','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NJ','NM',
      'NY','ND','OH','PA','RI','TN','TX','UT','VT','VA','WA','WV','WI','WY'],
  2: ['AL','AK','AR','CO','DE','GA','ID','IL','IA','KS','KY','LA','ME','MA','MI','MN','MS','MT','NE',
      'NH','NJ','NM','NC','OK','OR','RI','SC','SD','TN','TX','VA','WV','WY'],
  3: ['AL','AK','AZ','AR','CA','CO','CT','FL','GA','HI','ID','IL','IN','IA','KS','KY','LA','MD','MO',
      'NV','NH','NY','NC','ND','OH','OK','OR','PA','SC','SD','UT','VT','WA','WI'],
};

export const classUpInYear = (year: number): SenateClass | null => {
  for (const c of [1, 2, 3] as const) {
    if (year >= CLASS_ANCHOR_YEAR[c] && (year - CLASS_ANCHOR_YEAR[c]) % 6 === 0) return c;
  }
  return null;
};

/**
 * Current holders of every seat when the game opens.
 *
 * Default: the party the state leans toward. Overrides record actual holders
 * where a delegation runs against its lean. Independents who caucus with
 * Democrats (ME and VT, class 1) count as D.
 *   Class 1: 2024 winners.
 *   Class 2: holders elected in 2020. The class was up in November 2026;
 *            replace these with the certified 2026 winners when available.
 *   Class 3: 2022 winners (or appointees to their seats). These are the 34 seats
 *            up in 2028, so their holders set incumbency in the opening election.
 * With these, the opening Senate is 53 R – 47 D.
 */
export const HOLDER_OVERRIDES: Record<SenateClass, Partial<Record<StateCode, Party>>> = {
  1: { AZ: 'D', MI: 'D', NV: 'D', WI: 'D', ME: 'D' },
  2: { GA: 'D', MI: 'D', ME: 'R' },
  3: { AZ: 'D', GA: 'D', NV: 'D', PA: 'D', WI: 'R' },
};

export interface SenateSeat {
  state: StateCode;
  senateClass: SenateClass;
  holder: Party;
}

/** All 100 seats as they stand when the game opens. */
export function buildStartingSenate(): SenateSeat[] {
  const seats: SenateSeat[] = [];
  for (const c of [1, 2, 3] as const) {
    for (const state of SENATE_CLASSES[c]) {
      const holder = HOLDER_OVERRIDES[c][state] ?? (STATES[state].lean > 0 ? 'R' : 'D');
      seats.push({ state, senateClass: c, holder });
    }
  }
  return seats;
}
