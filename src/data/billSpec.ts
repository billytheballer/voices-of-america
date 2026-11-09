import { FACTION_IDS, METRIC_IDS, POLICY_AXES } from '@/domain/constants';
import type { BillAnalysis } from '@/domain/schemas/billAnalysis.schema';
import type { FactionId, ImpactDirection, ImpactMagnitude, MetricId, PolicyAxis } from '@/domain/types';

/**
 * A compact, hand-authored description of a bill or order. Demo bills,
 * department budget actions, directives and the executive-order catalog are
 * all written this way and expanded into a full BillAnalysis, so they go
 * through exactly the same engine path (capital, votes, courts, effects) as
 * a bill the analyst parsed from free text.
 */
export interface BillSpec {
  title: string;
  summary: string;
  instrument: BillAnalysis['instrument'];
  policy_areas: string[];
  radical: number;
  programmatic: number;
  rationale: [radical: string, programmatic: string];
  axes: Partial<Record<PolicyAxis, number>>;
  modifiers: Record<FactionId, [delta: number, reason: string]>;
  overrides?: BillAnalysis['state_overrides'];
  impacts?: Partial<Record<MetricId, [ImpactDirection, ImpactMagnitude]>>;
  flags?: Partial<BillAnalysis['flags']>;
}

export const NO_FLAGS: BillAnalysis['flags'] = {
  likely_court_challenge: false,
  exceeds_executive_authority: false,
  foreign_aid_blank_check: false,
  domestic_roi_tangible: false,
  deficit_financed: false,
  reconciliation_eligible: false,
};

export function buildAnalysis(d: BillSpec): BillAnalysis {
  return {
    schema_version: '1.0',
    title: d.title,
    summary: d.summary,
    instrument: d.instrument,
    policy_areas: d.policy_areas,
    radical_score: d.radical,
    programmatic_score: d.programmatic,
    score_rationale: { radical: d.rationale[0], programmatic: d.rationale[1] },
    policy_vector: Object.fromEntries(POLICY_AXES.map((a) => [a, d.axes[a] ?? null])) as BillAnalysis['policy_vector'],
    faction_modifiers: Object.fromEntries(
      FACTION_IDS.map((f) => [f, { delta: d.modifiers[f][0], reason: d.modifiers[f][1] }]),
    ) as BillAnalysis['faction_modifiers'],
    state_overrides: d.overrides ?? [],
    metric_impacts: Object.fromEntries(
      METRIC_IDS.map((m) => {
        const [direction, magnitude] = d.impacts?.[m] ?? ['none', 'none'];
        return [m, { direction, magnitude }];
      }),
    ) as BillAnalysis['metric_impacts'],
    flags: { ...NO_FLAGS, ...d.flags },
    confidence: 1,
  };
}

/**
 * Compact faction modifiers: [AF, TradCon, GOP-Est, D-Est, Prog, ModD, Ind, Lib].
 * Each entry is a delta and a short reason.
 */
export function mods(
  entries: [
    af: [number, string],
    trad: [number, string],
    gopEst: [number, string],
    dEst: [number, string],
    prog: [number, string],
    modD: [number, string],
    ind: [number, string],
    lib: [number, string],
  ],
): BillSpec['modifiers'] {
  return Object.fromEntries(FACTION_IDS.map((f, i) => [f, entries[i]!])) as BillSpec['modifiers'];
}
