import type { ImpactDirection, ImpactMagnitude, MetricId } from '@/domain/types';
import type { MetricShock } from '@/data/events';

/**
 * Converts the LLM's qualitative metric tags into engine numbers. The LLM
 * never produces a dollar figure or percentage; this table does.
 */
type Magnitude = Exclude<ImpactMagnitude, 'none'>;

const TABLE: Record<MetricId, Record<Magnitude, { up: MetricShock; down: MetricShock }>> = {
  gas_price: {
    minor: { up: { op: 'mult', value: 1.02 }, down: { op: 'mult', value: 0.98 } },
    moderate: { up: { op: 'mult', value: 1.05 }, down: { op: 'mult', value: 0.95 } },
    major: { up: { op: 'mult', value: 1.1 }, down: { op: 'mult', value: 0.9 } },
  },
  inflation: {
    minor: { up: { op: 'add', value: 0.1 }, down: { op: 'add', value: -0.1 } },
    moderate: { up: { op: 'add', value: 0.3 }, down: { op: 'add', value: -0.3 } },
    major: { up: { op: 'add', value: 0.6 }, down: { op: 'add', value: -0.6 } },
  },
  national_debt: {
    // Trillions of USD.
    minor: { up: { op: 'add', value: 0.1 }, down: { op: 'add', value: -0.05 } },
    moderate: { up: { op: 'add', value: 0.4 }, down: { op: 'add', value: -0.2 } },
    major: { up: { op: 'add', value: 1.0 }, down: { op: 'add', value: -0.5 } },
  },
  border_crossings: {
    minor: { up: { op: 'mult', value: 1.05 }, down: { op: 'mult', value: 0.95 } },
    moderate: { up: { op: 'mult', value: 1.15 }, down: { op: 'mult', value: 0.85 } },
    major: { up: { op: 'mult', value: 1.35 }, down: { op: 'mult', value: 0.7 } },
  },
  conflict_index: {
    minor: { up: { op: 'add', value: 2 }, down: { op: 'add', value: -2 } },
    moderate: { up: { op: 'add', value: 5 }, down: { op: 'add', value: -5 } },
    major: { up: { op: 'add', value: 10 }, down: { op: 'add', value: -10 } },
  },
};

/** Returns null for 'none' direction or magnitude. */
export function impactToShock(
  metric: MetricId,
  direction: ImpactDirection,
  magnitude: ImpactMagnitude,
): MetricShock | null {
  if (direction === 'none' || magnitude === 'none') return null;
  return TABLE[metric][magnitude][direction];
}
