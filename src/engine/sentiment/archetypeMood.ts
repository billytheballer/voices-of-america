import { METRIC_IDS, POLICY_AXES } from '@/domain/constants';
import type { MetricId, NationalMetrics, PolicyAxis, SparsePolicyVector } from '@/domain/types';
import type { ArchetypeMoodInput } from '@/domain/schemas/feedBatch.schema';
import { ARCHETYPES, type Archetype } from '@/data/archetypes';
import { FACTIONS } from '@/data/factions';
import { EVENTS } from '@/data/events';
import { METRIC_PRESSURE } from '@/data/balance.config';
import { clamp } from '@/lib/math';
import type { ElectorateMap } from '../types';
import { debtComfort } from '../economy/metrics';

/**
 * How each of the 20 voices FEELS this turn, computed before any LLM call.
 * The model only writes the words; the numbers come from the simulation, so a
 * post can never contradict the electorate it represents.
 *
 *   mood = 2 × (faction satisfaction in their state − 50)      the baseline
 *        − Σ metric sensitivity × how far each metric is past comfort
 *        ± how the latest law moved their hot-button axes toward or away from them
 */

export interface MoodContext {
  electorate: ElectorateMap;
  metrics: NationalMetrics;
  turn: number;
  eventId: string;
  /** Most recent enacted law this turn, if any. */
  law: { id: string; title: string; policy_vector: SparsePolicyVector } | null;
}

const METRIC_WORDS: Record<MetricId, string> = {
  gas_price: 'gas prices',
  inflation: 'grocery and rent prices',
  national_debt: 'the national debt',
  border_crossings: 'the border',
  conflict_index: 'the risk of war abroad',
};

const AXIS_WORDS: Record<PolicyAxis, string> = {
  economic: 'taxes and spending',
  trade: 'trade and jobs',
  foreign_policy: 'foreign policy',
  immigration: 'immigration',
  social: 'social issues',
  institutional: 'how Washington works',
};

/** 0..1 how far past its comfort level a metric is (1 = far past). */
export function metricStress(m: MetricId, metrics: NationalMetrics, turn: number): number {
  const p = METRIC_PRESSURE[m];
  const comfort = m === 'national_debt' ? debtComfort(turn) : p.comfort;
  const excess = Math.max(0, metrics[m] - comfort);
  // Scale: the excess at which pressure would cost ~10 satisfaction points/turn.
  return clamp((excess * p.perUnit) / 10, 0, 1);
}

/** −1..1: did the law move this archetype's hot-button axes toward (+) or away (−) from their faction? */
export function lawAlignment(a: Archetype, law: MoodContext['law']): number {
  if (!law) return 0;
  const ideal = FACTIONS[a.faction].idealPoint;
  let sum = 0;
  let n = 0;
  for (const axis of a.hotButtons) {
    const v = law.policy_vector[axis];
    if (v === null) continue;
    sum += 1 - Math.abs(ideal[axis] - v) / 10; // 1 = on their ideal, −1 = opposite extreme
    n++;
  }
  return n === 0 ? 0 : clamp(sum / n, -1, 1);
}

export function archetypeMood(a: Archetype, ctx: MoodContext): ArchetypeMoodInput {
  const sat = ctx.electorate[a.state][a.faction].satisfaction;
  let mood = 2 * (sat - 50);

  const stresses = METRIC_IDS.map((m) => ({ m, s: (a.metricSensitivity[m] ?? 0) * metricStress(m, ctx.metrics, ctx.turn) }));
  mood -= 30 * stresses.reduce((t, x) => t + x.s, 0);

  const align = lawAlignment(a, ctx.law);
  mood += 25 * align;

  const concerns: string[] = [];
  for (const { m } of stresses.filter((x) => x.s > 0.05).sort((x, y) => y.s - x.s)) concerns.push(METRIC_WORDS[m]);
  for (const axis of a.hotButtons) if (concerns.length < 3) concerns.push(AXIS_WORDS[axis]);

  const event = EVENTS.find((e) => e.id === ctx.eventId);
  const triggers: ArchetypeMoodInput['triggering_items'] = [];
  if (ctx.law && a.hotButtons.some((ax) => ctx.law!.policy_vector[ax] !== null)) {
    triggers.push({ type: 'bill', id: ctx.law.id, headline: ctx.law.title });
  }
  if (event) triggers.push({ type: 'event', id: event.id, headline: event.headline });
  const worst = stresses.sort((x, y) => y.s - x.s)[0];
  if (worst && worst.s > 0.15) {
    triggers.push({ type: 'metric', id: worst.m, headline: `Worry about ${METRIC_WORDS[worst.m]}` });
  }

  return {
    archetype_id: a.id,
    mood: Math.round(clamp(mood, -100, 100)),
    top_concerns: [...new Set(concerns)].slice(0, 3),
    triggering_items: triggers,
  };
}

export const allMoods = (ctx: MoodContext): ArchetypeMoodInput[] => ARCHETYPES.map((a) => archetypeMood(a, ctx));

/** Re-export for prompts/tests that need the axis list. */
export { POLICY_AXES };
