import { z } from 'zod';
import {
  FACTION_IDS,
  IMPACT_DIRECTIONS,
  IMPACT_MAGNITUDES,
  METRIC_IDS,
  PLAYABLE_PARTIES,
  POLICY_AXES,
  POLICY_AXIS_RANGE,
  STATE_CODES,
} from '../constants';

import { clamp } from '../../lib/math';

export { clamp };

/**
 * Integer in [min, max]. LLMs occasionally return 11 or 6.5; we round + clamp
 * rather than reject, because the *meaning* is unambiguous. Wrong types still fail.
 */
export const boundedInt = (min: number, max: number) =>
  z
    .number()
    .finite()
    // The range lives in the description (not as min/max) because we clamp instead
    // of rejecting; this is also what the LLM sees in the JSON Schema.
    .describe(`Integer from ${min} to ${max}.`)
    .transform((n) => clamp(Math.round(n), min, max));

/** Strict variant for values where out-of-range signals a real model error. */
export const strictInt = (min: number, max: number) => z.number().int().min(min).max(max);

export const shortText = (max: number) => z.string().trim().min(1).max(max);

export const FactionIdSchema = z.enum(FACTION_IDS);
export const StateCodeSchema = z.enum(STATE_CODES);
export const MetricIdSchema = z.enum(METRIC_IDS);
export const PartySchema = z.enum(PLAYABLE_PARTIES);
export const PolicyAxisSchema = z.enum(POLICY_AXES);

const axisValue = boundedInt(POLICY_AXIS_RANGE.min, POLICY_AXIS_RANGE.max);

/** Full vector: every axis set. In Zod 4, z.record over an enum is exhaustive. */
export const PolicyVectorSchema = z.record(PolicyAxisSchema, axisValue);

/** Bill vector: every axis key present, value null when the bill doesn't address it. */
export const SparsePolicyVectorSchema = z.record(PolicyAxisSchema, axisValue.nullable());

export const MetricImpactSchema = z.object({
  direction: z.enum(IMPACT_DIRECTIONS),
  magnitude: z.enum(IMPACT_MAGNITUDES),
});
