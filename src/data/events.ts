import type { FactionId, MetricId, RegionId, StateTag } from '@/domain/types';

/**
 * Global Event Ticker deck. One event fires per turn, drawn by weight with the
 * seeded RNG. Shocks here are engine-side numbers (not LLM output), applied
 * deterministically. All events are fictional and name no real people.
 */
export type EventCategory = 'disaster' | 'energy' | 'border' | 'geopolitics' | 'economy' | 'domestic' | 'tech';

export interface MetricShock {
  /** 'add' = absolute change; 'mult' = multiply current value. */
  op: 'add' | 'mult';
  value: number;
}

export interface EventCondition {
  metric: MetricId;
  op: 'gte' | 'lte';
  value: number;
  /** Weight multiplier applied while the condition holds. */
  weightMultiplier: number;
}

export interface GameEvent {
  id: string;
  category: EventCategory;
  headline: string;
  description: string;
  baseWeight: number;
  /** Severity 1–5: drives ticker styling and how loudly archetypes react. */
  severity: 1 | 2 | 3 | 4 | 5;
  metricShocks: Partial<Record<MetricId, MetricShock>>;
  /** Satisfaction changes, optionally limited to regions or tagged states. */
  factionShocks?: { faction: FactionId; delta: number; regions?: RegionId[]; stateTag?: StateTag }[];
  /** Makes the event more or less likely given current metrics. */
  conditions?: EventCondition[];
  /** Turns before the same event can fire again. */
  cooldownTurns: number;
  /** If true, the player is prompted to respond with an executive order or bill. */
  demandsResponse: boolean;
}

export const EVENTS: GameEvent[] = [
  // ---- Disasters ----
  {
    id: 'gulf_hurricane',
    category: 'disaster',
    headline: 'Category 4 hurricane slams the Gulf Coast',
    description: 'Refineries offline, thousands displaced, FEMA requests emergency supplemental funding.',
    baseWeight: 6,
    severity: 4,
    metricShocks: { gas_price: { op: 'add', value: 0.35 }, national_debt: { op: 'add', value: 0.08 } },
    factionShocks: [
      { faction: 'independent', delta: -3, regions: ['deep_south', 'southeast'] },
      { faction: 'd_moderate', delta: -2, regions: ['deep_south'] },
    ],
    cooldownTurns: 3,
    demandsResponse: true,
  },
  {
    id: 'western_wildfires',
    category: 'disaster',
    headline: 'Record wildfire season engulfs the West',
    description: 'Smoke blankets three states; utilities face blackouts and insurers pull out of markets.',
    baseWeight: 5,
    severity: 3,
    metricShocks: { inflation: { op: 'add', value: 0.1 } },
    factionShocks: [
      { faction: 'd_progressive', delta: -3, regions: ['pacific'] },
      { faction: 'independent', delta: -2, regions: ['pacific', 'mountain_west'] },
    ],
    cooldownTurns: 3,
    demandsResponse: true,
  },
  {
    id: 'midwest_drought',
    category: 'disaster',
    headline: 'Severe drought hits the Corn Belt',
    description: 'Crop yields fall sharply; grain futures spike and farm loans come due.',
    baseWeight: 4,
    severity: 3,
    metricShocks: { inflation: { op: 'add', value: 0.25 } },
    factionShocks: [
      { faction: 'd_moderate', delta: -3, stateTag: 'agriculture' },
      { faction: 'r_america_first', delta: -3, stateTag: 'agriculture' },
    ],
    cooldownTurns: 4,
    demandsResponse: true,
  },

  // ---- Energy ----
  {
    id: 'oil_embargo',
    category: 'energy',
    headline: 'Producer cartel announces surprise output cut',
    description: 'Crude jumps 20% overnight; analysts warn of $5 gas by summer.',
    baseWeight: 5,
    severity: 4,
    metricShocks: { gas_price: { op: 'mult', value: 1.18 }, inflation: { op: 'add', value: 0.4 } },
    conditions: [{ metric: 'conflict_index', op: 'gte', value: 60, weightMultiplier: 2 }],
    cooldownTurns: 4,
    demandsResponse: true,
  },
  {
    id: 'grid_cyberattack',
    category: 'tech',
    headline: 'Cyberattack knocks out a regional power grid',
    description: 'Millions without power for 48 hours; attribution points to a hostile state actor.',
    baseWeight: 3,
    severity: 4,
    metricShocks: { conflict_index: { op: 'add', value: 8 } },
    factionShocks: [{ faction: 'r_traditional_neocon', delta: -3 }],
    cooldownTurns: 5,
    demandsResponse: true,
  },
  {
    id: 'shale_boom',
    category: 'energy',
    headline: 'New drilling tech drives a domestic output surge',
    description: 'Production hits a record; gas prices ease ahead of travel season.',
    baseWeight: 3,
    severity: 1,
    metricShocks: { gas_price: { op: 'mult', value: 0.92 } },
    factionShocks: [{ faction: 'independent', delta: 2, stateTag: 'energy' }],
    cooldownTurns: 4,
    demandsResponse: false,
  },

  // ---- Border ----
  {
    id: 'border_surge',
    category: 'border',
    headline: 'Migrant surge overwhelms border processing centers',
    description: 'Shelters at capacity in border towns; governors demand federal help.',
    baseWeight: 5,
    severity: 4,
    metricShocks: { border_crossings: { op: 'mult', value: 1.6 } },
    factionShocks: [
      { faction: 'r_america_first', delta: -4 },
      { faction: 'independent', delta: -2, stateTag: 'border' },
    ],
    conditions: [{ metric: 'border_crossings', op: 'gte', value: 50_000, weightMultiplier: 1.5 }],
    cooldownTurns: 3,
    demandsResponse: true,
  },
  {
    id: 'border_protests',
    category: 'border',
    headline: 'Mass protests over border enforcement spread to major cities',
    description: 'Demonstrations both for and against new enforcement measures; clashes reported.',
    baseWeight: 3,
    severity: 3,
    metricShocks: {},
    factionShocks: [
      { faction: 'd_progressive', delta: -3, stateTag: 'urban_core' },
      { faction: 'independent', delta: -2, stateTag: 'suburban_swing' },
    ],
    cooldownTurns: 4,
    demandsResponse: true,
  },
  {
    id: 'farm_labor_shortage',
    category: 'border',
    headline: 'Farm labor shortage leaves crops rotting in fields',
    description: 'Growers say visa backlogs and enforcement have emptied their crews.',
    baseWeight: 3,
    severity: 2,
    metricShocks: { inflation: { op: 'add', value: 0.15 } },
    factionShocks: [{ faction: 'd_moderate', delta: -2, stateTag: 'agriculture' }],
    conditions: [{ metric: 'border_crossings', op: 'lte', value: 10_000, weightMultiplier: 2 }],
    cooldownTurns: 4,
    demandsResponse: true,
  },

  // ---- Geopolitics ----
  {
    id: 'strait_standoff',
    category: 'geopolitics',
    headline: 'Naval standoff in a vital Pacific strait',
    description: 'Allied shipping rerouted; chip supply chains brace for disruption.',
    baseWeight: 4,
    severity: 5,
    metricShocks: { conflict_index: { op: 'add', value: 12 }, inflation: { op: 'add', value: 0.3 } },
    cooldownTurns: 5,
    demandsResponse: true,
  },
  {
    id: 'ally_aid_request',
    category: 'geopolitics',
    headline: 'Embattled ally requests a major military aid package',
    description: 'Allies urge Washington to act; critics demand conditions and domestic returns.',
    baseWeight: 4,
    severity: 3,
    metricShocks: { conflict_index: { op: 'add', value: 5 } },
    cooldownTurns: 3,
    demandsResponse: true,
  },
  {
    id: 'ceasefire_brokered',
    category: 'geopolitics',
    headline: 'Ceasefire brokered in a long-running regional war',
    description: 'Markets rally on reduced risk; oil eases.',
    baseWeight: 2,
    severity: 1,
    metricShocks: { conflict_index: { op: 'add', value: -10 }, gas_price: { op: 'mult', value: 0.96 } },
    conditions: [{ metric: 'conflict_index', op: 'gte', value: 55, weightMultiplier: 2 }],
    cooldownTurns: 5,
    demandsResponse: false,
  },

  // ---- Economy ----
  {
    id: 'regional_bank_failure',
    category: 'economy',
    headline: 'Mid-size bank collapses after a run on deposits',
    description: 'Regulators step in over the weekend; contagion fears grip regional lenders.',
    baseWeight: 3,
    severity: 4,
    metricShocks: { national_debt: { op: 'add', value: 0.15 } },
    factionShocks: [{ faction: 'r_establishment', delta: -3 }, { faction: 'independent', delta: -2 }],
    cooldownTurns: 6,
    demandsResponse: true,
  },
  {
    id: 'port_strike',
    category: 'economy',
    headline: 'Dockworkers strike shuts down major ports',
    description: 'Shelves thin out; retailers warn of holiday shortages.',
    baseWeight: 3,
    severity: 3,
    metricShocks: { inflation: { op: 'add', value: 0.3 } },
    cooldownTurns: 5,
    demandsResponse: true,
  },
  {
    id: 'ai_layoff_wave',
    category: 'tech',
    headline: 'AI automation triggers wave of white-collar layoffs',
    description: 'Major firms cut back-office staff; displaced workers flood job boards.',
    baseWeight: 4,
    severity: 3,
    metricShocks: { inflation: { op: 'add', value: -0.1 } },
    factionShocks: [
      { faction: 'independent', delta: -3, stateTag: 'suburban_swing' },
      { faction: 'd_establishment', delta: -2 },
    ],
    cooldownTurns: 4,
    demandsResponse: true,
  },
  {
    id: 'debt_ceiling_standoff',
    category: 'domestic',
    headline: 'Treasury warns of default as debt-ceiling deadline nears',
    description: 'Credit agencies put the U.S. on watch; markets wobble.',
    baseWeight: 3,
    severity: 4,
    metricShocks: {},
    factionShocks: [{ faction: 'r_traditional_neocon', delta: -2 }, { faction: 'independent', delta: -2 }],
    conditions: [{ metric: 'national_debt', op: 'gte', value: 45, weightMultiplier: 2 }],
    cooldownTurns: 6,
    demandsResponse: true,
  },
  {
    id: 'strong_jobs_report',
    category: 'economy',
    headline: 'Blowout jobs report beats every forecast',
    description: 'Unemployment ticks down; wage growth outpaces prices for the first time in months.',
    baseWeight: 3,
    severity: 1,
    metricShocks: { inflation: { op: 'add', value: 0.05 } },
    factionShocks: [{ faction: 'independent', delta: 3 }, { faction: 'd_moderate', delta: 2 }],
    cooldownTurns: 3,
    demandsResponse: false,
  },
  {
    id: 'chip_plant_opening',
    category: 'tech',
    headline: 'Massive semiconductor plant opens in the heartland',
    description: 'Thousands of construction and manufacturing jobs; supply-chain hawks cheer.',
    baseWeight: 2,
    severity: 1,
    metricShocks: {},
    factionShocks: [
      { faction: 'r_america_first', delta: 3, stateTag: 'manufacturing' },
      { faction: 'd_moderate', delta: 2, stateTag: 'manufacturing' },
    ],
    cooldownTurns: 6,
    demandsResponse: false,
  },

  // ---- Domestic ----
  {
    id: 'pandemic_scare',
    category: 'domestic',
    headline: 'Novel respiratory virus prompts health emergency declaration',
    description: 'Hospitals strain in several metros; schools debate closures.',
    baseWeight: 2,
    severity: 4,
    metricShocks: { inflation: { op: 'add', value: 0.2 }, national_debt: { op: 'add', value: 0.1 } },
    factionShocks: [{ faction: 'libertarian_third', delta: -3 }, { faction: 'independent', delta: -2 }],
    cooldownTurns: 8,
    demandsResponse: true,
  },
  {
    id: 'landmark_court_ruling',
    category: 'domestic',
    headline: 'Supreme Court strikes down a major federal regulation',
    description: 'Ruling reshapes agency power; both parties scramble to respond.',
    baseWeight: 3,
    severity: 2,
    metricShocks: {},
    factionShocks: [{ faction: 'd_establishment', delta: -2 }, { faction: 'libertarian_third', delta: 2 }],
    cooldownTurns: 4,
    demandsResponse: false,
  },
];
