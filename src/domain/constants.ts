/**
 * Canonical identifiers for the whole app. Everything else (types, Zod schemas,
 * data files, UI) derives from these tuples, so adding a faction or axis is a
 * one-line change here followed by compiler-guided fixes everywhere else.
 */

// ---------------------------------------------------------------------------
// Factions (8) and the 3 display coalitions they roll up into
// ---------------------------------------------------------------------------
export const FACTION_IDS = [
  'r_america_first',
  'r_traditional_neocon',
  'r_establishment',
  'd_establishment',
  'd_progressive',
  'd_moderate',
  'independent',
  'libertarian_third',
] as const;

export const COALITION_IDS = ['gop', 'dem', 'third'] as const;

/** Which factions each display bucket contains. The UI shows 3 bars; click to expand to 8. */
export const COALITION_MEMBERS = {
  gop: ['r_america_first', 'r_traditional_neocon', 'r_establishment'],
  dem: ['d_establishment', 'd_progressive', 'd_moderate'],
  third: ['independent', 'libertarian_third'],
} as const satisfies Record<(typeof COALITION_IDS)[number], readonly (typeof FACTION_IDS)[number][]>;

export const COALITION_LABELS = {
  gop: 'GOP Coalition',
  dem: 'Democratic Coalition',
  third: 'Independents & Third Parties',
} as const satisfies Record<(typeof COALITION_IDS)[number], string>;

// ---------------------------------------------------------------------------
// Parties. MVP: player picks R or D. Independent run = future "hardcore" unlock.
// ---------------------------------------------------------------------------
export const PLAYABLE_PARTIES = ['R', 'D'] as const;

// ---------------------------------------------------------------------------
// Policy space. Every bill is placed on these axes (-10..+10, or null if the
// bill doesn't touch that axis). Faction ideal points and the reactive
// opposition platform live in the same space.
// ---------------------------------------------------------------------------
export const POLICY_AXES = [
  'economic', //      -10 redistributive / state-led      ↔ +10 fiscal conservative / free market
  'trade', //         -10 globalist free trade            ↔ +10 protectionist
  'foreign_policy', //-10 restraint / non-intervention    ↔ +10 interventionist / alliance-first
  'immigration', //   -10 open / expansive                ↔ +10 restrictive / enforcement-first
  'social', //        -10 progressive                     ↔ +10 traditional
  'institutional', // -10 structural overhaul / disruptive ↔ +10 incremental / institutionalist
] as const;

export const POLICY_AXIS_RANGE = { min: -10, max: 10 } as const;

export const POLICY_AXIS_LABELS = {
  economic: { neg: 'Redistributive', pos: 'Free-Market' },
  trade: { neg: 'Globalist', pos: 'Protectionist' },
  foreign_policy: { neg: 'Restraint', pos: 'Interventionist' },
  immigration: { neg: 'Expansive', pos: 'Restrictive' },
  social: { neg: 'Progressive', pos: 'Traditional' },
  institutional: { neg: 'Disruptive', pos: 'Institutionalist' },
} as const satisfies Record<(typeof POLICY_AXES)[number], { neg: string; pos: string }>;

// ---------------------------------------------------------------------------
// National metrics
// ---------------------------------------------------------------------------
export const METRIC_IDS = [
  'gas_price',
  'inflation',
  'national_debt',
  'border_crossings',
  'conflict_index',
] as const;

export const IMPACT_DIRECTIONS = ['none', 'up', 'down'] as const;
export const IMPACT_MAGNITUDES = ['none', 'minor', 'moderate', 'major'] as const;

// ---------------------------------------------------------------------------
// Geography (50 states + DC) and the regions used for correlated Monte Carlo error
// ---------------------------------------------------------------------------
export const STATE_CODES = [
  'AL', 'AK', 'AZ', 'AR', 'CA', 'CO', 'CT', 'DE', 'DC', 'FL', 'GA', 'HI', 'ID', 'IL', 'IN',
  'IA', 'KS', 'KY', 'LA', 'ME', 'MD', 'MA', 'MI', 'MN', 'MS', 'MO', 'MT', 'NE', 'NV', 'NH',
  'NJ', 'NM', 'NY', 'NC', 'ND', 'OH', 'OK', 'OR', 'PA', 'RI', 'SC', 'SD', 'TN', 'TX', 'UT',
  'VT', 'VA', 'WA', 'WV', 'WI', 'WY',
] as const;

export const REGION_IDS = [
  'northeast',
  'rust_belt',
  'southeast',
  'deep_south',
  'plains',
  'mountain_west',
  'southwest',
  'pacific',
] as const;

/** Demographic tags attached to states; faction rules can target them. */
export const STATE_TAGS = ['urban_core', 'suburban_swing', 'rural', 'border', 'energy', 'agriculture', 'manufacturing'] as const;

// ---------------------------------------------------------------------------
// Game loop
// ---------------------------------------------------------------------------
export const GAME_PHASES = [
  'setup',
  'primary',
  'general_campaign',
  'general_election',
  'transition',
  'governing',
  'midterm_campaign',
  'midterm_election',
  'game_over',
] as const;

export const START_YEAR = 2028;
export const TOTAL_ELECTORAL_VOTES = 538;
export const ELECTORAL_VOTES_TO_WIN = 270;
export const HOUSE_SEATS = 435;
export const SENATE_SEATS = 100;
export const MAX_PRESIDENTIAL_TERMS = 2; // 22nd Amendment → successor handoff after term 2

export const MONTE_CARLO_RUNS = 10_000;
export const FEED_SIZE = 20;

// ---------------------------------------------------------------------------
// Executive branch: the 15 cabinet departments plus the EPA
// ---------------------------------------------------------------------------
export const DEPARTMENT_IDS = [
  'agriculture',
  'commerce',
  'defense',
  'education',
  'energy',
  'hhs',
  'dhs',
  'hud',
  'interior',
  'justice',
  'labor',
  'state',
  'transportation',
  'treasury',
  'va',
  'epa',
] as const;

/** Budget level of a department: each step is ±15% of its baseline. */
export const DEPARTMENT_LEVELS = [-2, -1, 0, 1, 2] as const;

/** A candidate's place in their party: activist base, party core, or moderate wing. */
export const CANDIDATE_WINGS = ['base', 'core', 'moderate'] as const;
