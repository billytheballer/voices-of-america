import type { BillAnalysis } from '@/domain/schemas/billAnalysis.schema';
import { buildAnalysis, type BillSpec } from './billSpec';

/**
 * Hand-written bill analyses so the game is playable before the LLM parser
 * lands (Stages 10–11). They go through the same engine path as parsed bills,
 * and a test validates every one against BillAnalysisSchema. The set spans the
 * spectrum, with one radical bill from each side to demonstrate capital costs.
 */

interface DemoSpec extends BillSpec {
  id: string;
}

function build(d: DemoSpec): DemoBill {
  const { id, ...spec } = d;
  return { id, analysis: buildAnalysis(spec) };
}

export interface DemoBill {
  id: string;
  analysis: BillAnalysis;
}

export const DEMO_BILLS: DemoBill[] = [
  build({
    id: 'harvest_border',
    title: 'Harvest and Border Security Act',
    summary:
      'Funds border infrastructure and 3,000 new processing officers, paired with a seasonal agricultural visa exemption for vetted farmworkers.',
    instrument: 'legislation',
    policy_areas: ['border', 'agriculture', 'labor'],
    radical: 4,
    programmatic: 8,
    rationale: ['Pairs enforcement with a narrow labor carve-out.', 'Funded, phased, with hiring targets.'],
    axes: { immigration: 5, trade: 1, economic: 1 },
    modifiers: {
      r_america_first: [3, 'Border funding outweighs the visa carve-out'],
      r_traditional_neocon: [2, 'Orderly enforcement'],
      r_establishment: [3, 'Agriculture lobby wins'],
      d_establishment: [0, 'Mixed: humane processing, more enforcement'],
      d_progressive: [-3, 'Enforcement-first framing'],
      d_moderate: [4, 'Farm labor relief for rural districts'],
      independent: [3, 'Looks like a workable compromise'],
      libertarian_third: [1, 'Visa expansion offsets spending'],
    },
    overrides: [
      { state: 'CA', faction: 'd_moderate', delta: 3, reason: 'Central Valley farm labor' },
      { state: 'TX', faction: 'r_america_first', delta: 2, reason: 'Border-county infrastructure' },
    ],
    impacts: { border_crossings: ['down', 'moderate'], inflation: ['down', 'minor'], national_debt: ['up', 'minor'] },
    flags: { deficit_financed: true },
  }),
  build({
    id: 'family_tax_credit',
    title: 'Working Families Tax Credit Act',
    summary: 'Expands the child tax credit to $3,000 per child with a phase-out above $150,000 household income.',
    instrument: 'legislation',
    policy_areas: ['taxes', 'family'],
    radical: 5,
    programmatic: 7,
    rationale: ['A large but familiar expansion.', 'Clear amounts and phase-outs; unfunded.'],
    axes: { economic: -5, social: -1 },
    modifiers: {
      r_america_first: [1, 'Helps working families, adds to deficit'],
      r_traditional_neocon: [-2, 'Deficit-financed'],
      r_establishment: [-3, 'Unfunded spending'],
      d_establishment: [5, 'Core party priority'],
      d_progressive: [4, 'Wants it bigger'],
      d_moderate: [4, 'Popular in rural districts'],
      independent: [2, 'Tangible relief'],
      libertarian_third: [-4, 'New spending'],
    },
    impacts: { inflation: ['up', 'minor'], national_debt: ['up', 'moderate'] },
    flags: { deficit_financed: true, reconciliation_eligible: true },
  }),
  build({
    id: 'allied_supply_chain',
    title: 'Allied Supply Chain Compact',
    summary:
      'Security assistance to allies in exchange for guaranteed chip and critical-mineral supply agreements with U.S. manufacturers.',
    instrument: 'legislation',
    policy_areas: ['foreign policy', 'trade', 'manufacturing'],
    radical: 3,
    programmatic: 8,
    rationale: ['Conventional alliance policy with conditions.', 'Specific supply commitments and milestones.'],
    axes: { foreign_policy: 5, trade: -2 },
    modifiers: {
      r_america_first: [2, 'Aid comes with a domestic return'],
      r_traditional_neocon: [4, 'Strengthens alliances'],
      r_establishment: [3, 'Stable supply chains'],
      d_establishment: [2, 'Multilateral approach'],
      d_progressive: [-2, 'More military commitments'],
      d_moderate: [1, 'Manufacturing jobs'],
      independent: [1, 'Sensible'],
      libertarian_third: [-3, 'Foreign entanglement'],
    },
    impacts: { conflict_index: ['down', 'minor'], inflation: ['down', 'minor'] },
    flags: { domestic_roi_tangible: true },
  }),
  build({
    id: 'gas_tax_holiday',
    title: 'Emergency Gas Tax Holiday',
    summary: 'An executive order suspending collection of the federal gas tax for 90 days.',
    instrument: 'executive_order',
    policy_areas: ['energy', 'taxes'],
    radical: 6,
    programmatic: 3,
    rationale: ['Tests the limits of executive power over taxes.', 'No offset or enforcement mechanism.'],
    axes: { economic: -1, institutional: -4 },
    modifiers: {
      r_america_first: [2, 'Relief at the pump'],
      r_traditional_neocon: [-1, 'Gimmick'],
      r_establishment: [-2, 'Highway fund hole'],
      d_establishment: [-1, 'Questionable authority'],
      d_progressive: [-3, 'Subsidizes fossil fuels'],
      d_moderate: [2, 'Rural drivers benefit'],
      independent: [3, 'Immediate savings'],
      libertarian_third: [1, 'Any tax cut'],
    },
    impacts: { gas_price: ['down', 'moderate'], national_debt: ['up', 'minor'] },
    flags: { exceeds_executive_authority: true, likely_court_challenge: true },
  }),
  build({
    id: 'single_payer',
    title: 'National Single-Payer Health Care Act',
    summary: 'Replaces private insurance with a federally run single-payer health system over four years.',
    instrument: 'legislation',
    policy_areas: ['health care', 'taxes'],
    radical: 9,
    programmatic: 5,
    rationale: ['Restructures a sixth of the economy.', 'Phased timeline; financing left to future bills.'],
    axes: { economic: -9, institutional: -7, social: -3 },
    modifiers: {
      r_america_first: [-5, 'Government takeover'],
      r_traditional_neocon: [-8, 'Massive tax increases'],
      r_establishment: [-9, 'Eliminates an industry'],
      d_establishment: [-1, 'Too far, too fast'],
      d_progressive: [9, 'The central demand'],
      d_moderate: [-4, 'Voters fear losing their plans'],
      independent: [-3, 'Cost worries'],
      libertarian_third: [-9, 'Maximal state control'],
    },
    impacts: { national_debt: ['up', 'major'], inflation: ['up', 'minor'] },
  }),
  build({
    id: 'agency_consolidation',
    title: 'Federal Workforce Reduction and Agency Consolidation Act',
    summary: 'Cuts the federal civilian workforce by 25% and merges or eliminates eleven agencies within two years.',
    instrument: 'legislation',
    policy_areas: ['government', 'budget'],
    radical: 8,
    programmatic: 6,
    rationale: ['Sweeping restructuring of the executive branch.', 'Named agencies and targets; transition costs unclear.'],
    axes: { economic: 8, institutional: -7 },
    modifiers: {
      r_america_first: [6, 'Drains the bureaucracy'],
      r_traditional_neocon: [3, 'Spending discipline'],
      r_establishment: [-1, 'Disruptive to business'],
      d_establishment: [-8, 'Guts public services'],
      d_progressive: [-9, 'Attacks the public sector'],
      d_moderate: [-5, 'Hurts federal workers in their districts'],
      independent: [-2, 'Chaotic'],
      libertarian_third: [8, 'Smaller government'],
    },
    overrides: [
      { state: 'MD', faction: 'independent', delta: -4, reason: 'Federal workforce concentration' },
      { state: 'VA', faction: 'independent', delta: -4, reason: 'Federal workforce concentration' },
    ],
    impacts: { national_debt: ['down', 'moderate'] },
  }),
];
