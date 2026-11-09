import { COALITION_IDS, COALITION_LABELS, COALITION_MEMBERS } from './constants';
import type { CoalitionId, CoalitionRecord, FactionId, FactionRecord } from './types';

/**
 * View-model helpers for the 3-bucket display. The engine always works with
 * all 8 factions; these only collapse them for the UI. Clicking a bucket
 * shows `members` (the 8-way split for that bucket).
 */

export interface CoalitionBreakdown {
  id: CoalitionId;
  label: string;
  /** Aggregated value for the whole bucket. */
  value: number;
  members: { faction: FactionId; value: number; weight: number }[];
}

export const coalitionOf = (faction: FactionId): CoalitionId =>
  COALITION_IDS.find((c) => (COALITION_MEMBERS[c] as readonly FactionId[]).includes(faction))!;

/** Additive quantities (vote share, population share): bucket = sum of members. */
export function sumByCoalition(
  values: FactionRecord<number>,
  weights?: FactionRecord<number>,
): CoalitionRecord<CoalitionBreakdown> {
  return build(values, weights, (members) => members.reduce((s, m) => s + m.value, 0));
}

/** Intensive quantities (satisfaction, turnout): bucket = weight-averaged mean. */
export function weightedMeanByCoalition(
  values: FactionRecord<number>,
  weights: FactionRecord<number>,
): CoalitionRecord<CoalitionBreakdown> {
  return build(values, weights, (members) => {
    const w = members.reduce((s, m) => s + m.weight, 0);
    return w === 0 ? 0 : members.reduce((s, m) => s + m.value * m.weight, 0) / w;
  });
}

function build(
  values: FactionRecord<number>,
  weights: FactionRecord<number> | undefined,
  aggregate: (members: CoalitionBreakdown['members']) => number,
): CoalitionRecord<CoalitionBreakdown> {
  const out = {} as CoalitionRecord<CoalitionBreakdown>;
  for (const id of COALITION_IDS) {
    const members = COALITION_MEMBERS[id].map((faction) => ({
      faction,
      value: values[faction],
      weight: weights?.[faction] ?? 1,
    }));
    out[id] = { id, label: COALITION_LABELS[id], value: aggregate(members), members };
  }
  return out;
}
