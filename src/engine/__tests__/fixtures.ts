import { FACTION_IDS, METRIC_IDS } from '@/domain/constants';
import type { BillAnalysis } from '@/domain/schemas/billAnalysis.schema';
import type { FactionId, SparsePolicyVector } from '@/domain/types';

export const NO_AXES: SparsePolicyVector = {
  economic: null, trade: null, foreign_policy: null, immigration: null, social: null, institutional: null,
};

/** A neutral bill: zero modifiers, no impacts, no flags. Override what a test needs. */
export function makeBill(overrides: Partial<BillAnalysis> & { modifiers?: Partial<Record<FactionId, number>> } = {}): BillAnalysis {
  const { modifiers = {}, ...rest } = overrides;
  return {
    schema_version: '1.0',
    title: 'Test Act',
    summary: 'A test bill.',
    instrument: 'legislation',
    policy_areas: ['test'],
    radical_score: 3,
    programmatic_score: 10,
    score_rationale: { radical: 'test', programmatic: 'test' },
    policy_vector: NO_AXES,
    faction_modifiers: Object.fromEntries(
      FACTION_IDS.map((f) => [f, { delta: modifiers[f] ?? 0, reason: 'test' }]),
    ) as BillAnalysis['faction_modifiers'],
    state_overrides: [],
    metric_impacts: Object.fromEntries(
      METRIC_IDS.map((m) => [m, { direction: 'none', magnitude: 'none' }]),
    ) as BillAnalysis['metric_impacts'],
    flags: {
      likely_court_challenge: false,
      exceeds_executive_authority: false,
      foreign_aid_blank_check: false,
      domestic_roi_tangible: false,
      deficit_financed: false,
      reconciliation_eligible: false,
    },
    confidence: 1,
    ...rest,
  };
}
