import { FACTION_IDS } from '@/domain/constants';
import type { FactionId, FactionRecord } from '@/domain/types';
import { clamp } from '@/lib/math';
import { FACTIONS } from '../factions';
import type { StateProfile } from '../states';

/**
 * Turns a StateProfile's few readable dials into per-faction electorate data.
 * Pure + deterministic: same profile, same electorate.
 *
 * Step 1: split the electorate into three coalition pools by partisan lean.
 * Step 2: split each pool into its factions using urbanization, the
 *         libertarian streak and the progressive-hub dial.
 * Step 3: normalize so all 8 weights sum to exactly 1.
 */

export interface FactionElectorate {
  /** Share of this state's electorate (all 8 sum to 1). */
  weight: number;
  /** Baseline turnout probability for this faction in this state. */
  baseTurnout: number;
  /** Satisfaction with the player's party, 0–100 (50 = neutral). */
  satisfaction: number;
  /** Temporary turnout shift from faction rules (e.g. +0.05 urban progressive surge). Decays. */
  turnoutShift: number;
}

export type StateElectorate = FactionRecord<FactionElectorate>;

/** Coefficients for the derivation; kept here because they're data, not engine rules. */
const DERIVE = {
  committedPoolBase: 0.34,
  committedPoolPerLeanPoint: 0.0085,
  thirdPoolBase: 0.3,
  thirdPoolLibBoost: 0.06,
  thirdPoolPolarizationDrag: 0.004,
  minPool: 0.01,
} as const;

export function coalitionPools(p: StateProfile) {
  const gop = Math.max(DERIVE.minPool, DERIVE.committedPoolBase + DERIVE.committedPoolPerLeanPoint * p.lean);
  const dem = Math.max(DERIVE.minPool, DERIVE.committedPoolBase - DERIVE.committedPoolPerLeanPoint * p.lean);
  const third = Math.max(
    0.05,
    DERIVE.thirdPoolBase +
      DERIVE.thirdPoolLibBoost * p.libertarianStreak -
      DERIVE.thirdPoolPolarizationDrag * Math.abs(p.lean),
  );
  return { gop, dem, third };
}

function withinCoalitionMix(p: StateProfile): FactionRecord<number> {
  const rural = 1 - p.urbanization;
  const manufacturing = p.tags.includes('manufacturing') ? 1 : 0;

  const gop = normalize({
    r_america_first: 0.5 + 0.3 * rural + 0.1 * manufacturing,
    r_traditional_neocon: 0.22 + 0.05 * rural,
    r_establishment: 0.15 + 0.3 * p.urbanization,
  });
  const dem = normalize({
    d_establishment: 0.45 + 0.1 * p.urbanization,
    d_progressive: 0.1 + 0.4 * p.progressiveHub + 0.1 * p.urbanization,
    d_moderate: 0.15 + 0.4 * rural,
  });
  const third = normalize({
    independent: 0.85,
    libertarian_third: 0.12 + 0.35 * p.libertarianStreak,
  });

  return { ...gop, ...dem, ...third } as FactionRecord<number>;
}

export function deriveStateElectorate(p: StateProfile): StateElectorate {
  const pools = coalitionPools(p);
  const mix = withinCoalitionMix(p);

  const raw = {} as FactionRecord<number>;
  for (const id of FACTION_IDS) {
    raw[id] = pools[FACTIONS[id].coalition] * mix[id];
  }
  const weights = normalize(raw);

  const out = {} as StateElectorate;
  for (const id of FACTION_IDS) {
    out[id] = {
      weight: weights[id],
      baseTurnout: clamp(FACTIONS[id].baseTurnout + p.turnoutModifier, 0.2, 0.95),
      satisfaction: 50,
      turnoutShift: 0,
    };
  }
  return out;
}

function normalize<K extends FactionId>(rec: Record<K, number>): Record<K, number> {
  const total = (Object.values(rec) as number[]).reduce((s, v) => s + v, 0);
  return Object.fromEntries(Object.entries(rec).map(([k, v]) => [k, (v as number) / total])) as Record<K, number>;
}
