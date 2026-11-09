import { POLICY_AXES, POLICY_AXIS_RANGE } from '@/domain/constants';
import { clamp } from '@/lib/math';
import type { Party, PolicyVector, SparsePolicyVector } from '@/domain/types';
import type { FactionDefinition } from '@/data/factions';
import { OPPOSITION } from '@/data/balance.config';

/**
 * Reactive opposition: a deterministic baseline, NOT an autonomous AI.
 *
 *   1. The player's platform P drifts toward each enacted bill's policy vector.
 *   2. On every axis where P is salient (|P| > threshold), the opposition's
 *      target slides from its party anchor toward the mirror image (−P).
 *   3. It is bounded by a corridor around its anchor (a party can't become
 *      unrecognisable) and smoothed by inertia (no whiplash).
 *
 * Example: Dem player pushes DSA economics (P.economic → −8) and the GOP baseline
 * shifts toward fiscal conservatism. GOP player runs America First trade
 * (P.trade → +9) and the Dem baseline shifts globalist. Because it's
 * per-axis, factions only partly aligned with the player (e.g. AF vs.
 * Progressives, who are both protectionist-leaning) get nuanced outcomes.
 */

/** The tuning shape, with numbers widened so tests and callers can pass other values. */
export type OppositionConfig = { [K in keyof typeof OPPOSITION]: (typeof OPPOSITION)[K] extends number ? number : (typeof OPPOSITION)[K] };

const { min: AXIS_MIN, max: AXIS_MAX } = POLICY_AXIS_RANGE;
const clampAxis = (v: number) => clamp(v, AXIS_MIN, AXIS_MAX);

/** A party's natural centre of gravity = weight-averaged ideal point of its home factions. */
export function computePartyAnchor(party: Party, factions: readonly FactionDefinition[]): PolicyVector {
  const members = factions.filter((f) => f.homeParty === party);
  const totalWeight = members.reduce((s, f) => s + f.nationalWeight, 0);
  if (totalWeight === 0) throw new Error(`No factions with homeParty=${party}`);

  const anchor = {} as PolicyVector;
  for (const axis of POLICY_AXES) {
    anchor[axis] = members.reduce((s, f) => s + f.idealPoint[axis] * f.nationalWeight, 0) / totalWeight;
  }
  return anchor;
}

/**
 * Move the player's platform toward an enacted bill. More radical bills move it
 * further (they define you). Axes the bill doesn't touch are unchanged.
 */
export function updatePlayerPlatform(
  platform: PolicyVector,
  bill: { policy_vector: SparsePolicyVector; radical_score: number },
  cfg: Pick<OppositionConfig, 'platformLearningRate'> = OPPOSITION,
): PolicyVector {
  const weight = cfg.platformLearningRate * (0.5 + bill.radical_score / 20); // 0.55×–1.0× LR
  const next = { ...platform };
  for (const axis of POLICY_AXES) {
    const target = bill.policy_vector[axis];
    if (target === null) continue;
    next[axis] = clampAxis(platform[axis] + weight * (target - platform[axis]));
  }
  return next;
}

/** 0 below the salience threshold, ramping linearly to 1 at the axis extreme. */
export function axisProvocation(value: number, threshold: number): number {
  return clamp((Math.abs(value) - threshold) / (AXIS_MAX - threshold), 0, 1);
}

/** The opposition's ideal position this turn, before inertia. */
export function computeOppositionTarget(
  playerPlatform: PolicyVector,
  oppositionAnchor: PolicyVector,
  cfg: OppositionConfig = OPPOSITION,
): PolicyVector {
  const target = {} as PolicyVector;
  for (const axis of POLICY_AXES) {
    const anchor = oppositionAnchor[axis];
    const mirror = -playerPlatform[axis];
    const pull = cfg.mirrorStrength * axisProvocation(playerPlatform[axis], cfg.salienceThreshold);
    const raw = anchor + pull * (mirror - anchor);
    target[axis] = clampAxis(clamp(raw, anchor - cfg.corridor, anchor + cfg.corridor));
  }
  return target;
}

/** One deterministic turn step of the opposition platform. */
export function stepOppositionPlatform(
  previous: PolicyVector,
  playerPlatform: PolicyVector,
  oppositionAnchor: PolicyVector,
  cfg: OppositionConfig = OPPOSITION,
): PolicyVector {
  const target = computeOppositionTarget(playerPlatform, oppositionAnchor, cfg);
  const next = {} as PolicyVector;
  for (const axis of POLICY_AXES) {
    next[axis] = clampAxis(previous[axis] + cfg.inertia * (target[axis] - previous[axis]));
  }
  return next;
}

export const opposingParty = (p: Party): Party => (p === 'R' ? 'D' : 'R');
