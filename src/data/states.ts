import type { RegionId, StateCode, StateTag } from '@/domain/types';

/**
 * State profiles: the hand-authored inputs. Per-faction weights are NOT typed
 * in by hand (51 × 8 = 408 magic numbers). They're derived from these few
 * readable dials by `deriveStateElectorate()` in ./derive/stateElectorate.ts.
 *
 * `lean` is an approximate partisan lean in points relative to the nation
 * (positive = GOP), roughly reflecting 2020–2024 presidential results. It's a
 * game-balance input; tune freely.
 */
export interface StateProfile {
  code: StateCode;
  name: string;
  electoralVotes: number;
  /** House seats = EVs − 2 (DC has none). Derived, stored for readability. */
  houseSeats: number;
  region: RegionId;
  lean: number;
  /** 0 = deeply rural, 1 = fully metropolitan. */
  urbanization: number;
  /** Libertarian / anti-establishment streak (0–1). */
  libertarianStreak: number;
  /** Concentration of young, college-town or big-city progressive voters (0–1). */
  progressiveHub: number;
  /** State turnout culture, added to faction base turnout (e.g. MN +0.08, OK −0.08). */
  turnoutModifier: number;
  tags: StateTag[];
  /** Maine & Nebraska split EVs by congressional district. */
  districts?: { id: string; lean: number }[];
}

type Row = [
  code: StateCode,
  name: string,
  ev: number,
  region: RegionId,
  lean: number,
  urban: number,
  lib: number,
  prog: number,
  turnout: number,
  tags: StateTag[],
];

// prettier-ignore
const ROWS: Row[] = [
  ['AL', 'Alabama',          9, 'deep_south',    15, 0.45, 0.10, 0.05, -0.03, ['rural', 'manufacturing']],
  ['AK', 'Alaska',           3, 'pacific',        6, 0.40, 0.70, 0.05,  0.00, ['rural', 'energy']],
  ['AZ', 'Arizona',         11, 'southwest',      3, 0.75, 0.40, 0.25,  0.01, ['suburban_swing', 'border']],
  ['AR', 'Arkansas',         6, 'deep_south',    15, 0.40, 0.10, 0.05, -0.06, ['rural', 'agriculture']],
  ['CA', 'California',      54, 'pacific',      -11, 0.90, 0.25, 0.70, -0.02, ['urban_core', 'border', 'agriculture']],
  ['CO', 'Colorado',        10, 'mountain_west', -4, 0.75, 0.50, 0.50,  0.06, ['suburban_swing', 'energy']],
  ['CT', 'Connecticut',      7, 'northeast',     -7, 0.75, 0.15, 0.35,  0.02, ['suburban_swing']],
  ['DE', 'Delaware',         3, 'northeast',     -7, 0.70, 0.10, 0.30,  0.02, ['suburban_swing']],
  ['DC', 'District of Columbia', 3, 'northeast', -38, 1.00, 0.10, 0.90,  0.03, ['urban_core']],
  ['FL', 'Florida',         30, 'southeast',      5, 0.80, 0.20, 0.20,  0.02, ['suburban_swing']],
  ['GA', 'Georgia',         16, 'southeast',      1, 0.70, 0.15, 0.35,  0.01, ['suburban_swing', 'urban_core']],
  ['HI', 'Hawaii',           4, 'pacific',      -12, 0.70, 0.10, 0.40, -0.07, ['urban_core']],
  ['ID', 'Idaho',            4, 'mountain_west', 18, 0.40, 0.55, 0.05,  0.00, ['rural', 'agriculture']],
  ['IL', 'Illinois',        19, 'rust_belt',     -5, 0.80, 0.15, 0.45,  0.00, ['urban_core', 'agriculture', 'manufacturing']],
  ['IN', 'Indiana',         11, 'rust_belt',      9, 0.55, 0.15, 0.10, -0.04, ['manufacturing', 'rural']],
  ['IA', 'Iowa',             6, 'plains',         6, 0.45, 0.20, 0.15,  0.03, ['agriculture', 'rural']],
  ['KS', 'Kansas',           6, 'plains',         8, 0.50, 0.30, 0.10,  0.00, ['agriculture', 'rural', 'energy']],
  ['KY', 'Kentucky',         8, 'southeast',     16, 0.40, 0.15, 0.05, -0.02, ['rural', 'energy', 'manufacturing']],
  ['LA', 'Louisiana',        8, 'deep_south',    11, 0.55, 0.10, 0.10, -0.02, ['energy']],
  ['ME', 'Maine',            4, 'northeast',     -2, 0.30, 0.30, 0.30,  0.07, ['rural']],
  ['MD', 'Maryland',        10, 'northeast',    -14, 0.80, 0.10, 0.50,  0.02, ['suburban_swing', 'urban_core']],
  ['MA', 'Massachusetts',   11, 'northeast',    -14, 0.85, 0.15, 0.60,  0.03, ['urban_core']],
  ['MI', 'Michigan',        15, 'rust_belt',      1, 0.65, 0.20, 0.30,  0.05, ['manufacturing', 'suburban_swing']],
  ['MN', 'Minnesota',       10, 'rust_belt',     -1, 0.65, 0.20, 0.45,  0.08, ['suburban_swing', 'agriculture']],
  ['MS', 'Mississippi',      6, 'deep_south',    10, 0.30, 0.10, 0.05, -0.01, ['rural', 'agriculture']],
  ['MO', 'Missouri',        10, 'plains',         9, 0.60, 0.20, 0.15,  0.00, ['rural', 'suburban_swing']],
  ['MT', 'Montana',          4, 'mountain_west', 10, 0.35, 0.70, 0.10,  0.05, ['rural', 'energy']],
  ['NE', 'Nebraska',         5, 'plains',         8, 0.55, 0.20, 0.10,  0.01, ['agriculture']],
  ['NV', 'Nevada',           6, 'southwest',      1, 0.90, 0.50, 0.25,  0.00, ['suburban_swing', 'urban_core']],
  ['NH', 'New Hampshire',    4, 'northeast',     -1, 0.50, 0.75, 0.20,  0.07, ['suburban_swing']],
  ['NJ', 'New Jersey',      14, 'northeast',     -3, 0.90, 0.10, 0.35,  0.00, ['suburban_swing', 'urban_core']],
  ['NM', 'New Mexico',       5, 'southwest',     -3, 0.60, 0.25, 0.30, -0.03, ['border', 'energy']],
  ['NY', 'New York',        28, 'northeast',     -8, 0.85, 0.15, 0.60, -0.02, ['urban_core']],
  ['NC', 'North Carolina',  16, 'southeast',      2, 0.60, 0.20, 0.30,  0.02, ['suburban_swing', 'manufacturing']],
  ['ND', 'North Dakota',     3, 'plains',        18, 0.40, 0.30, 0.05, -0.02, ['energy', 'agriculture', 'rural']],
  ['OH', 'Ohio',            17, 'rust_belt',      6, 0.65, 0.15, 0.20,  0.00, ['manufacturing']],
  ['OK', 'Oklahoma',         7, 'plains',        17, 0.55, 0.20, 0.05, -0.08, ['energy', 'rural']],
  ['OR', 'Oregon',           8, 'pacific',       -6, 0.70, 0.40, 0.55,  0.04, ['urban_core']],
  ['PA', 'Pennsylvania',    19, 'rust_belt',      1, 0.70, 0.15, 0.30,  0.02, ['manufacturing', 'suburban_swing', 'energy']],
  ['RI', 'Rhode Island',     4, 'northeast',     -8, 0.85, 0.10, 0.40, -0.01, ['urban_core']],
  ['SC', 'South Carolina',   9, 'southeast',      8, 0.55, 0.15, 0.10, -0.02, ['manufacturing']],
  ['SD', 'South Dakota',     3, 'plains',        15, 0.40, 0.30, 0.05, -0.01, ['agriculture', 'rural']],
  ['TN', 'Tennessee',       11, 'southeast',     14, 0.55, 0.15, 0.10, -0.05, ['manufacturing']],
  ['TX', 'Texas',           40, 'southwest',      6, 0.80, 0.35, 0.25, -0.06, ['border', 'energy', 'suburban_swing']],
  ['UT', 'Utah',             6, 'mountain_west', 11, 0.70, 0.45, 0.10,  0.02, ['suburban_swing']],
  ['VT', 'Vermont',          3, 'northeast',    -16, 0.30, 0.35, 0.70,  0.02, ['rural']],
  ['VA', 'Virginia',        13, 'southeast',     -2, 0.70, 0.15, 0.35,  0.03, ['suburban_swing']],
  ['WA', 'Washington',      12, 'pacific',       -8, 0.80, 0.30, 0.55,  0.05, ['urban_core', 'agriculture']],
  ['WV', 'West Virginia',    4, 'rust_belt',     21, 0.30, 0.15, 0.05, -0.06, ['energy', 'rural']],
  ['WI', 'Wisconsin',       10, 'rust_belt',      0, 0.55, 0.20, 0.30,  0.07, ['suburban_swing', 'manufacturing', 'agriculture']],
  ['WY', 'Wyoming',          3, 'mountain_west', 23, 0.35, 0.60, 0.05,  0.00, ['energy', 'rural']],
];

/** Approximate district leans for the two split-EV states. */
const DISTRICTS: Partial<Record<StateCode, { id: string; lean: number }[]>> = {
  ME: [
    { id: 'ME-1', lean: -9 },
    { id: 'ME-2', lean: 8 },
  ],
  NE: [
    { id: 'NE-1', lean: 8 },
    { id: 'NE-2', lean: -2 },
    { id: 'NE-3', lean: 28 },
  ],
};

export const STATES: Record<StateCode, StateProfile> = Object.fromEntries(
  ROWS.map(([code, name, ev, region, lean, urban, lib, prog, turnout, tags]) => {
    const districts = DISTRICTS[code];
    const profile: StateProfile = {
      code,
      name,
      electoralVotes: ev,
      houseSeats: code === 'DC' ? 0 : ev - 2,
      region,
      lean,
      urbanization: urban,
      libertarianStreak: lib,
      progressiveHub: prog,
      turnoutModifier: turnout,
      tags,
      ...(districts ? { districts } : {}),
    };
    return [code, profile];
  }),
) as Record<StateCode, StateProfile>;

export const STATE_LIST: readonly StateProfile[] = Object.values(STATES);
