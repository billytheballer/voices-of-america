import type { CoalitionId, FactionId, FactionRecord, Party, PolicyVector } from '@/domain/types';

/**
 * The 8 electoral factions. These are *national defaults*; Stage 3's states.ts
 * overrides weight / turnout per state. Behavioural penalties (e.g. the
 * America First foreign-aid backlash) are NOT hardcoded here. They live as
 * data-driven rules in balance.config.ts so they can be tuned without touching
 * engine code.
 */
export interface FactionDefinition {
  id: FactionId;
  coalition: CoalitionId;
  /** Party this faction normally votes with. `null` = no default home. */
  homeParty: Party | null;
  label: string;
  shortLabel: string;
  description: string;
  /** Approximate national share of the electorate (all 8 sum to 1). */
  nationalWeight: number;
  /** Baseline probability of voting in a presidential year (0–1). */
  baseTurnout: number;
  /**
   * How strongly turnout responds to (dis)satisfaction (0–1).
   * High = surges when energized, stays home when demoralized.
   */
  turnoutElasticity: number;
  /**
   * Built-in partisan lean fed into the vote-choice sigmoid.
   * -1 = locked-in Dem, +1 = locked-in GOP, 0 = genuine swing.
   */
  partyLean: number;
  /** Where this faction wants policy to be, on each axis (-10..+10). */
  idealPoint: PolicyVector;
  /** How much each axis matters to this faction (0–1). Drives satisfaction-from-distance. */
  axisSalience: PolicyVector;
  /** Structural media/fundraising multipliers (1 = normal). */
  structural: { media: number; fundraising: number };
  /** Tailwind color token, matching src/styles/index.css. */
  colorToken: string;
}

export const FACTIONS: FactionRecord<FactionDefinition> = {
  r_america_first: {
    id: 'r_america_first',
    coalition: 'gop',
    homeParty: 'R',
    label: 'America First',
    shortLabel: 'AmFirst',
    description:
      'Transactional non-interventionists. Prioritize border security and domestic protectionism. Back global action only with a tangible domestic return (e.g. securing supply chains); punish blank-check foreign aid.',
    nationalWeight: 0.18,
    baseTurnout: 0.64,
    turnoutElasticity: 0.75,
    partyLean: 0.8,
    idealPoint: { economic: 4, trade: 9, foreign_policy: -6, immigration: 10, social: 7, institutional: -5 },
    axisSalience: { economic: 0.5, trade: 0.9, foreign_policy: 0.8, immigration: 1.0, social: 0.6, institutional: 0.5 },
    structural: { media: 1, fundraising: 1 },
    colorToken: 'r-america-first',
  },
  r_traditional_neocon: {
    id: 'r_traditional_neocon',
    coalition: 'gop',
    homeParty: 'R',
    label: 'Traditional Conservative',
    shortLabel: 'TradCon',
    description: 'Strong national defense, international alliances, fiscal conservatism.',
    nationalWeight: 0.08,
    baseTurnout: 0.72,
    turnoutElasticity: 0.35,
    partyLean: 0.85,
    idealPoint: { economic: 8, trade: -2, foreign_policy: 9, immigration: 6, social: 6, institutional: 6 },
    axisSalience: { economic: 0.9, trade: 0.4, foreign_policy: 1.0, immigration: 0.5, social: 0.6, institutional: 0.6 },
    structural: { media: 1, fundraising: 1 },
    colorToken: 'r-traditional-neocon',
  },
  r_establishment: {
    id: 'r_establishment',
    coalition: 'gop',
    homeParty: 'R',
    label: 'GOP Establishment',
    shortLabel: 'GOP Est.',
    description:
      'Business-oriented institutionalists. Vital in swing states; a liability in primaries.',
    nationalWeight: 0.07,
    baseTurnout: 0.7,
    turnoutElasticity: 0.3,
    partyLean: 0.45,
    idealPoint: { economic: 7, trade: -6, foreign_policy: 5, immigration: 2, social: 1, institutional: 8 },
    axisSalience: { economic: 1.0, trade: 0.8, foreign_policy: 0.5, immigration: 0.4, social: 0.3, institutional: 0.8 },
    structural: { media: 1, fundraising: 1 },
    colorToken: 'r-establishment',
  },
  d_establishment: {
    id: 'd_establishment',
    coalition: 'dem',
    homeParty: 'D',
    label: 'Democratic Establishment',
    shortLabel: 'Dem Est.',
    description: 'The party core: incremental policy and institutional norms.',
    nationalWeight: 0.16,
    baseTurnout: 0.68,
    turnoutElasticity: 0.35,
    partyLean: -0.8,
    idealPoint: { economic: -4, trade: -3, foreign_policy: 4, immigration: -3, social: -5, institutional: 8 },
    axisSalience: { economic: 0.7, trade: 0.4, foreign_policy: 0.5, immigration: 0.5, social: 0.8, institutional: 0.9 },
    structural: { media: 1, fundraising: 1 },
    colorToken: 'd-establishment',
  },
  d_progressive: {
    id: 'd_progressive',
    coalition: 'dem',
    homeParty: 'D',
    label: 'Progressive / DSA',
    shortLabel: 'Prog',
    description:
      'Structural reformers. Maximize turnout in deep-blue urban hubs; their agenda can cost the coalition suburban and independent support.',
    nationalWeight: 0.09,
    baseTurnout: 0.55,
    turnoutElasticity: 0.85,
    partyLean: -0.85,
    idealPoint: { economic: -9, trade: 3, foreign_policy: -6, immigration: -9, social: -9, institutional: -8 },
    axisSalience: { economic: 1.0, trade: 0.4, foreign_policy: 0.6, immigration: 0.8, social: 1.0, institutional: 0.7 },
    structural: { media: 1, fundraising: 1 },
    colorToken: 'd-progressive',
  },
  d_moderate: {
    id: 'd_moderate',
    coalition: 'dem',
    homeParty: 'D',
    label: 'Moderate Democrat',
    shortLabel: 'Mod Dem',
    description: 'Fiscally cautious, socially moderate; rural and frontline swing districts.',
    nationalWeight: 0.08,
    baseTurnout: 0.62,
    turnoutElasticity: 0.45,
    partyLean: -0.4,
    idealPoint: { economic: 0, trade: 2, foreign_policy: 2, immigration: 2, social: -1, institutional: 5 },
    axisSalience: { economic: 0.9, trade: 0.6, foreign_policy: 0.4, immigration: 0.6, social: 0.6, institutional: 0.6 },
    structural: { media: 1, fundraising: 1 },
    colorToken: 'd-moderate',
  },
  independent: {
    id: 'independent',
    coalition: 'third',
    homeParty: null,
    label: 'True Independent',
    shortLabel: 'Indep.',
    description: 'Swing voters. Reward competence and results, punish extremes on either side.',
    nationalWeight: 0.28,
    baseTurnout: 0.52,
    turnoutElasticity: 0.55,
    partyLean: 0,
    idealPoint: { economic: 1, trade: 2, foreign_policy: -1, immigration: 3, social: -1, institutional: 0 },
    axisSalience: { economic: 1.0, trade: 0.5, foreign_policy: 0.4, immigration: 0.7, social: 0.5, institutional: 0.4 },
    structural: { media: 1, fundraising: 1 },
    colorToken: 'independent',
  },
  libertarian_third: {
    id: 'libertarian_third',
    coalition: 'third',
    homeParty: null,
    label: 'Libertarian / Third Party',
    shortLabel: 'Lib/3rd',
    description: 'Small-government, civil-liberties voters. Structurally starved of coverage and money.',
    nationalWeight: 0.06,
    baseTurnout: 0.5,
    turnoutElasticity: 0.4,
    partyLean: 0.15,
    idealPoint: { economic: 9, trade: -8, foreign_policy: -8, immigration: -4, social: -4, institutional: -6 },
    axisSalience: { economic: 1.0, trade: 0.6, foreign_policy: 0.8, immigration: 0.4, social: 0.6, institutional: 0.7 },
    // The spec's 90% structural penalty to media coverage and fundraising.
    structural: { media: 0.1, fundraising: 0.1 },
    colorToken: 'libertarian-third',
  },
};

export const FACTION_LIST: readonly FactionDefinition[] = Object.values(FACTIONS);
