import type { FactionId, Party, PolicyAxis } from '@/domain/types';

/**
 * Campaign tuning and content. Every number the campaign engine uses lives
 * here, like balance.config.ts does for governing.
 */
export const CAMPAIGN = {
  actionsPerTurn: 3,
  /** Campaign funds are in millions of dollars. */
  startingFunds: 60,
  maxFunds: 500,

  fundraise: {
    /** $M raised = base × (0.6 + 0.8 × approval) × donor mood (0.5–1.5). */
    base: 40,
    /** Courting donors pleases the establishment wing and irritates the base wing. */
    establishmentDelta: 1,
    baseDelta: -0.5,
  },

  rally: {
    /** Turnout boost for the player's three home factions in the state, before diminishing returns. */
    turnout: 0.025,
    homeSatisfaction: 2,
    independentSatisfaction: 1.5,
    /** Earned media: small nationwide lift with independents. */
    nationalIndependentSatisfaction: 0.2,
  },

  ads: {
    /** $M per House seat that buys one "unit" of persuasion. Big states cost more. */
    costPerSeat: 1.5,
    /** Satisfaction points per sqrt(unit), for persuadable factions. */
    pointsPerSqrtUnit: 1.6,
    /** Cap on the gain from a single buy, per faction. */
    maxPerBuy: 4,
    minBuy: 5,
    maxBuy: 60,
  },

  /** During general and midterm campaigns, the opposition advertises in the closest states each turn. */
  oppositionAds: { states: 6, independentDelta: -1.2, moderateDelta: -0.6 },

  pledge: {
    wingSatisfaction: 4,
    wingTurnout: 0.02,
    otherWingsDelta: -1,
    /** How strongly a pledge pulls the platform toward the wing (like a bill of this radicalism). */
    platformRadicalism: 6,
  },

  primary: {
    /**
     * share = Σ weight × clamp(0.5 + (sat − 50) / spread + frontRunnerBonus) + noise.
     * Contented party (50) ≈ 70%; lukewarm (43) ≈ 56%; real danger only below ~35.
     */
    spread: 50,
    frontRunnerBonus: 0.2,
    noiseSd: 0.06,
  },

  debate: {
    /** SD of the performance roll, in satisfaction points with independents. Attack answers are riskier. */
    performanceSd: 1.5,
    attackPerformanceSd: 2.5,
  },
} as const;

/** The three wings of each party, by the role they play in campaigns. */
export const WINGS: Record<Party, { base: FactionId; core: FactionId; moderate: FactionId }> = {
  R: { base: 'r_america_first', core: 'r_traditional_neocon', moderate: 'r_establishment' },
  D: { base: 'd_progressive', core: 'd_establishment', moderate: 'd_moderate' },
};

/** Who votes in each party's primary. Activists dominate; the moderate wing is outvoted. */
export const PRIMARY_WEIGHTS: Record<Party, Partial<Record<FactionId, number>>> = {
  R: { r_america_first: 0.5, r_traditional_neocon: 0.3, r_establishment: 0.2 },
  D: { d_establishment: 0.45, d_progressive: 0.35, d_moderate: 0.2 },
};

export type DebateStyle = 'base' | 'center' | 'attack';

export interface DebateTopic {
  id: string;
  question: string;
  axis: PolicyAxis;
}

export const DEBATE_TOPICS: DebateTopic[] = [
  { id: 'prices', question: 'Families say groceries and rent are out of reach. What will you do about the cost of living?', axis: 'economic' },
  { id: 'border', question: 'Border towns say they are overwhelmed. What is your immigration plan?', axis: 'immigration' },
  { id: 'trade', question: 'Should America use tariffs to bring manufacturing jobs home?', axis: 'trade' },
  { id: 'war', question: 'An ally is under attack. How far should the United States go to help?', axis: 'foreign_policy' },
  { id: 'washington', question: 'Voters say Washington is broken. What would you change about how government works?', axis: 'institutional' },
  { id: 'values', question: 'The country is divided on social issues. Where do you stand, and how will you lead everyone?', axis: 'social' },
];

export const DEBATE_STYLE_TEXT: Record<DebateStyle, { label: string; hint: string }> = {
  base: { label: 'Speak to your base', hint: 'Energizes your activist wing; independents may tune out.' },
  center: { label: 'Pivot to the center', hint: 'Wins over independents and moderates; your base grumbles.' },
  attack: { label: 'Go after your opponent', hint: 'Fires up all your partisans, but a high-variance performance.' },
};

/** Satisfaction effects of each debate style, by wing role. */
export const DEBATE_EFFECTS: Record<DebateStyle, { base: number; core: number; moderate: number; independent: number }> = {
  base: { base: 3, core: 1, moderate: -1, independent: -1.5 },
  center: { base: -1.5, core: 0.5, moderate: 2, independent: 2.5 },
  attack: { base: 2, core: 2, moderate: 0.5, independent: -0.5 },
};
