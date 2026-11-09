import type { NationalMetrics } from '@/domain/types';

/**
 * Opening snapshot for the 2028 cycle. Illustrative, plausible values. This
 * is a game, not a forecast, so tune freely.
 */
export const INITIAL_METRICS: NationalMetrics = {
  gas_price: 3.25,
  inflation: 2.9,
  national_debt: 41.5,
  border_crossings: 12_000,
  conflict_index: 45,
};

/** Hard floors/ceilings the engine clamps metrics to. */
export const METRIC_BOUNDS: Record<keyof NationalMetrics, { min: number; max: number }> = {
  gas_price: { min: 1.5, max: 9 },
  inflation: { min: -2, max: 15 },
  national_debt: { min: 0, max: 100 },
  border_crossings: { min: 0, max: 400_000 },
  conflict_index: { min: 0, max: 100 },
};

export const STARTING_POLITICAL_CAPITAL = 40;
export const CAMPAIGN_START = { year: 2028, phase: 'primary' } as const;
