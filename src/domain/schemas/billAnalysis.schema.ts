import { z } from 'zod';
import {
  boundedInt,
  FactionIdSchema,
  MetricIdSchema,
  MetricImpactSchema,
  shortText,
  SparsePolicyVectorSchema,
  StateCodeSchema,
  strictInt,
} from './shared';

/**
 * Contract for the bill-parser LLM call.
 *
 * Design rule: the LLM *interprets*; the engine *decides*. Everything here is
 * either a bounded score, a bounded modifier, or a qualitative tag. The engine
 * turns these into numbers via balance.config.ts and impact tables.
 *
 * The same schema is converted to JSON Schema (z.toJSONSchema) and handed to
 * Anthropic as a tool `input_schema`, so the prompt contract and the runtime
 * validator can never drift apart.
 */

export const BILL_FLAGS = [
  'likely_court_challenge',
  'exceeds_executive_authority',
  'foreign_aid_blank_check',
  'domestic_roi_tangible',
  'deficit_financed',
  /** Purely budgetary (taxes, spending, debt limit): eligible for 51-vote Senate reconciliation. */
  'reconciliation_eligible',
] as const;
export type BillFlag = (typeof BILL_FLAGS)[number];

const FactionModifierSchema = z.object({
  /** Satisfaction change for this faction, nationally. */
  delta: boundedInt(-10, 10),
  reason: shortText(140),
});

const StateOverrideSchema = z.object({
  state: StateCodeSchema,
  faction: FactionIdSchema,
  /** Extra, state-local satisfaction change on top of the national delta. */
  delta: boundedInt(-5, 5),
  reason: shortText(140),
});

export const BillAnalysisSchema = z.object({
  schema_version: z.literal('1.0'),
  title: shortText(80),
  summary: shortText(300),
  instrument: z.enum(['executive_order', 'legislation']),
  policy_areas: z.array(shortText(32)).min(1).max(6),

  /** 1 = mainstream/incremental, 10 = radical. Drives political-capital cost. */
  radical_score: strictInt(1, 10),
  /** 1 = vague aspiration, 10 = funded, phased, measurable. Low → passage penalty. */
  programmatic_score: strictInt(1, 10),
  score_rationale: z.object({
    radical: shortText(200),
    programmatic: shortText(200),
  }),

  /** Where the bill sits in policy space. Feeds the reactive opposition model. */
  policy_vector: SparsePolicyVectorSchema,

  /** All 8 factions required (exhaustive record). */
  faction_modifiers: z.record(FactionIdSchema, FactionModifierSchema),

  state_overrides: z
    .array(StateOverrideSchema)
    .max(5)
    .refine(
      (arr) => new Set(arr.map((o) => `${o.state}:${o.faction}`)).size === arr.length,
      'Duplicate state/faction override',
    ),

  /** Qualitative only; engine maps (direction, magnitude) → numeric delta. */
  metric_impacts: z.record(MetricIdSchema, MetricImpactSchema),

  flags: z.record(z.enum(BILL_FLAGS), z.boolean()),

  /** Model's self-reported confidence in its read of the text (0–1). */
  confidence: z.number().min(0).max(1),
});

export type BillAnalysis = z.infer<typeof BillAnalysisSchema>;
