import { POLICY_AXES, POLICY_AXIS_RANGE } from '@/domain/constants';
import type { FactionDefinition } from '@/data/factions';
import type { PolicyVector } from '@/domain/types';

/** Salience-weighted distance from a faction's ideal point to a platform, normalized to [0, 1]. */
export function weightedDistance(f: FactionDefinition, platform: PolicyVector): number {
  const span = POLICY_AXIS_RANGE.max - POLICY_AXIS_RANGE.min;
  let num = 0;
  let den = 0;
  for (const a of POLICY_AXES) {
    num += f.axisSalience[a] * Math.abs(f.idealPoint[a] - platform[a]);
    den += f.axisSalience[a];
  }
  return den === 0 ? 0 : num / den / span;
}

/**
 * How much closer the player is than the opposition, in [−1, 1].
 * Positive = this faction prefers the player's platform.
 * This is how the reactive opposition actually costs or wins you votes.
 */
export function proximityAdvantage(
  f: FactionDefinition,
  playerPlatform: PolicyVector,
  oppositionPlatform: PolicyVector,
): number {
  return weightedDistance(f, oppositionPlatform) - weightedDistance(f, playerPlatform);
}
