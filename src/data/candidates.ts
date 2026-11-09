import type { CandidateWing, Party, StateCode } from '@/domain/types';

/**
 * Who the player runs against. For the first cycles (through REAL_POOL_LAST_CYCLE)
 * the opposing nominee and the player's main primary rival are drawn from pools
 * of real national politicians, weighted toward the most-discussed names. After
 * that the game generates fictional candidates.
 *
 * Real names are used only as opponents in a simulation. The game never
 * attributes quotes, statements or events to them; every campaign effect is
 * described in generic terms ("your ads on their record"). Ratings (1–5) are
 * game abstractions, kept in a narrow 3–5 band for real people.
 */
export interface CandidateSeed {
  id: string;
  name: string;
  home: StateCode;
  wing: CandidateWing;
  /** Relative chance of being drawn. */
  weight: number;
  charisma: number;
  fundraising: number;
  discipline: number;
}

export const REAL_POOL_LAST_CYCLE = 2036;

export const CANDIDATE_POOLS: Record<Party, CandidateSeed[]> = {
  R: [
    { id: 'jd-vance', name: 'JD Vance', home: 'OH', wing: 'base', weight: 5, charisma: 3, fundraising: 5, discipline: 4 },
    { id: 'marco-rubio', name: 'Marco Rubio', home: 'FL', wing: 'core', weight: 2, charisma: 4, fundraising: 4, discipline: 4 },
    { id: 'ron-desantis', name: 'Ron DeSantis', home: 'FL', wing: 'base', weight: 2, charisma: 3, fundraising: 4, discipline: 4 },
    { id: 'glenn-youngkin', name: 'Glenn Youngkin', home: 'VA', wing: 'moderate', weight: 1.5, charisma: 4, fundraising: 5, discipline: 4 },
    { id: 'nikki-haley', name: 'Nikki Haley', home: 'SC', wing: 'moderate', weight: 1, charisma: 4, fundraising: 4, discipline: 4 },
    { id: 'josh-hawley', name: 'Josh Hawley', home: 'MO', wing: 'base', weight: 1, charisma: 3, fundraising: 3, discipline: 4 },
    { id: 'vivek-ramaswamy', name: 'Vivek Ramaswamy', home: 'OH', wing: 'base', weight: 1, charisma: 4, fundraising: 4, discipline: 3 },
    { id: 'sarah-huckabee-sanders', name: 'Sarah Huckabee Sanders', home: 'AR', wing: 'core', weight: 1, charisma: 3, fundraising: 3, discipline: 4 },
    { id: 'brian-kemp', name: 'Brian Kemp', home: 'GA', wing: 'moderate', weight: 1, charisma: 3, fundraising: 4, discipline: 5 },
    { id: 'tim-scott', name: 'Tim Scott', home: 'SC', wing: 'core', weight: 1, charisma: 4, fundraising: 4, discipline: 4 },
    { id: 'ted-cruz', name: 'Ted Cruz', home: 'TX', wing: 'core', weight: 0.8, charisma: 3, fundraising: 4, discipline: 3 },
    { id: 'byron-donalds', name: 'Byron Donalds', home: 'FL', wing: 'base', weight: 0.6, charisma: 4, fundraising: 3, discipline: 3 },
    { id: 'tom-cotton', name: 'Tom Cotton', home: 'AR', wing: 'core', weight: 0.6, charisma: 3, fundraising: 3, discipline: 4 },
  ],
  D: [
    { id: 'gavin-newsom', name: 'Gavin Newsom', home: 'CA', wing: 'core', weight: 3, charisma: 5, fundraising: 5, discipline: 3 },
    { id: 'pete-buttigieg', name: 'Pete Buttigieg', home: 'MI', wing: 'moderate', weight: 3, charisma: 5, fundraising: 5, discipline: 5 },
    { id: 'alexandria-ocasio-cortez', name: 'Alexandria Ocasio-Cortez', home: 'NY', wing: 'base', weight: 2.5, charisma: 5, fundraising: 5, discipline: 3 },
    { id: 'josh-shapiro', name: 'Josh Shapiro', home: 'PA', wing: 'moderate', weight: 2.5, charisma: 4, fundraising: 5, discipline: 4 },
    { id: 'gretchen-whitmer', name: 'Gretchen Whitmer', home: 'MI', wing: 'core', weight: 2, charisma: 4, fundraising: 4, discipline: 4 },
    { id: 'jon-ossoff', name: 'Jon Ossoff', home: 'GA', wing: 'core', weight: 1.5, charisma: 4, fundraising: 5, discipline: 5 },
    { id: 'wes-moore', name: 'Wes Moore', home: 'MD', wing: 'core', weight: 1.5, charisma: 5, fundraising: 4, discipline: 4 },
    { id: 'andy-beshear', name: 'Andy Beshear', home: 'KY', wing: 'moderate', weight: 1.5, charisma: 4, fundraising: 3, discipline: 5 },
    { id: 'jb-pritzker', name: 'JB Pritzker', home: 'IL', wing: 'core', weight: 1.5, charisma: 3, fundraising: 5, discipline: 4 },
    { id: 'kamala-harris', name: 'Kamala Harris', home: 'CA', wing: 'core', weight: 1, charisma: 3, fundraising: 5, discipline: 3 },
    { id: 'cory-booker', name: 'Cory Booker', home: 'NJ', wing: 'core', weight: 1, charisma: 4, fundraising: 4, discipline: 3 },
    { id: 'ro-khanna', name: 'Ro Khanna', home: 'CA', wing: 'base', weight: 1, charisma: 3, fundraising: 3, discipline: 4 },
    { id: 'chris-murphy', name: 'Chris Murphy', home: 'CT', wing: 'base', weight: 1, charisma: 4, fundraising: 4, discipline: 4 },
    { id: 'mark-kelly', name: 'Mark Kelly', home: 'AZ', wing: 'moderate', weight: 1, charisma: 3, fundraising: 4, discipline: 5 },
    { id: 'ruben-gallego', name: 'Ruben Gallego', home: 'AZ', wing: 'moderate', weight: 0.8, charisma: 4, fundraising: 3, discipline: 4 },
    { id: 'raphael-warnock', name: 'Raphael Warnock', home: 'GA', wing: 'core', weight: 0.7, charisma: 5, fundraising: 4, discipline: 4 },
  ],
};

/** Name parts for generated candidates after the real pools run out. */
export const GENERATED_FIRST = [
  'Avery', 'Jordan', 'Morgan', 'Elena', 'Marcus', 'Priya', 'Caleb', 'Danielle', 'Rafael', 'Hannah',
  'Malik', 'Grace', 'Owen', 'Sofia', 'Wyatt', 'Naomi', 'Theo', 'Camila', 'Isaiah', 'Claire',
  'Mateo', 'Vanessa', 'Russell', 'Imani', 'Garrett', 'Leah', 'Dominic', 'Tessa', 'Andre', 'Meredith',
];
export const GENERATED_LAST = [
  'Whitaker', 'Delgado', 'Okafor', 'Brennan', 'Castillo', 'Hartley', 'Nakamura', 'Sullivan', 'Mercer', 'Ramirez',
  'Calloway', 'Lindqvist', 'Pryor', 'Ashford', 'Vasquez', 'Holloway', 'Kowalski', 'Desai', 'Fairbanks', 'Reyes',
  'Thornton', 'Abernathy', 'Quinlan', 'Moreau', 'Gallagher', 'Hensley', 'Iverson', 'Banerjee', 'Caldwell', 'Ostrowski',
];

export const WING_LABEL: Record<CandidateWing, string> = {
  base: 'Activist wing',
  core: 'Party mainstream',
  moderate: 'Moderate wing',
};

/** Campaign-trail tuning for opponents and negative campaigning. */
export const RACE = {
  /** At the nomination: the opponent's home state rallies to them (satisfaction with the player, turnout). */
  homeState: { satisfaction: -3, turnout: 0.02 },
  /** How far the opposition platform moves toward the nominee's wing at the convention. */
  wingPull: 0.15,
  /** The player's primary support in the rival's wing drops by this much. */
  rivalWingPenalty: 0.08,
  /** Opposition ad strength = base + per × fundraising. */
  oppositionAdScale: { base: 0.45, per: 0.15 },
  /** The opponent's weekly attack on your most extreme position (general campaign). */
  opponentAttack: { minDistance: 3, perPoint: 0.1, charismaBase: 0.6, charismaPer: 0.2, max: 0.6 },
  /** Rapid response halves the opposition's ads and attacks this quarter. */
  rapidResponseFactor: 0.5,
  /** Debate: your performance mean shifts by (3 − their charisma) × this. */
  debateCharisma: 0.4,
  /** Each point of opposition research adds this to every attack answer in the debate. */
  debateOppoBonus: 0.3,

  attack: {
    /** Your attack effectiveness = (base − per × their discipline) / (1 + fatigue × negativity). */
    effectivenessBase: 1.3,
    effectivenessPerDiscipline: 0.1,
    fatigue: 0.35,
    /** Backlash chance = base + per × negativity (halved for research releases and negative ads). */
    backlashBase: 0.08,
    backlashPer: 0.06,
    backlash: { independent: -1, ownModerate: -0.5 },
    /** Negativity decays by this each quarter. */
    negativityDecay: 1,
  },
  /**
   * Hit their record: gain = clamp(perPoint × (contrast + offset), min, max) with independents
   * nationwide. The offset is the benefit of the doubt a fresh attack gets; it only backfires
   * when your own record on the issue is clearly worse.
   */
  record: { cost: 10, perPoint: 0.3, offset: 1.5, min: -1.2, max: 1.8, theirModerateShare: 0.5 },
  research: { cost: 15, maxFile: 3 },
  /** Release the file: independents +perPoint × file, their partisans' turnout −turnoutPerPoint × file. */
  release: { perPoint: 0.6, turnoutPerPoint: 0.008 },
  /** Negative ads: share of a positive ad's persuasion, plus a turnout hit on their partisans. */
  negativeAd: { persuasionShare: 0.7, turnoutPerPoint: 0.01, negativity: 0.5 },
} as const;
