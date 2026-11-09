import { FACTION_IDS, METRIC_IDS, STATE_CODES } from '@/domain/constants';
import type { FactionRecord, MetricId, NationalMetrics } from '@/domain/types';
import type { BillAnalysis } from '@/domain/schemas/billAnalysis.schema';
import type { MetricShock } from '@/data/events';
import { METRIC_BOUNDS } from '@/data/initialState';
import { IMPLEMENTATION, METRIC_DRIFT, METRIC_PRESSURE } from '@/data/balance.config';
import { clamp } from '@/lib/math';
import type { AppliedEffect, ElectorateMap } from '../types';
import { shockFaction } from '../electorate/applyModifiers';
import { impactToShock } from './impactTables';

const bound = (m: MetricId, v: number) => clamp(v, METRIC_BOUNDS[m].min, METRIC_BOUNDS[m].max);

/** Applies one shock. `scale` dampens it (1 = full effect); for 'mult', scales the change, not the factor. */
export function applyShock(metrics: NationalMetrics, metric: MetricId, shock: MetricShock, scale = 1): NationalMetrics {
  const current = metrics[metric];
  const next = shock.op === 'add' ? current + shock.value * scale : current * (1 + (shock.value - 1) * scale);
  return { ...metrics, [metric]: bound(metric, next) };
}

export function applyShocks(
  metrics: NationalMetrics,
  shocks: Partial<Record<MetricId, MetricShock>>,
  scale = 1,
): NationalMetrics {
  let m = metrics;
  for (const id of METRIC_IDS) {
    const s = shocks[id];
    if (s) m = applyShock(m, id, s, scale);
  }
  return m;
}

/** Programmatic 1 → 0.55× effect, 10 → 1.0×. Vague bills deliver less. */
export const implementationFactor = (programmaticScore: number, cfg = IMPLEMENTATION) =>
  cfg.baseEffect + cfg.perProgrammaticPoint * programmaticScore;

/** Applies an enacted bill's qualitative impacts, scaled by how concrete the bill is. */
export function applyBillImpacts(metrics: NationalMetrics, bill: BillAnalysis): NationalMetrics {
  const scale = implementationFactor(bill.programmatic_score);
  let m = metrics;
  for (const id of METRIC_IDS) {
    const { direction, magnitude } = bill.metric_impacts[id];
    const shock = impactToShock(id, direction, magnitude);
    if (shock) m = applyShock(m, id, shock, scale);
  }
  return m;
}

/** One turn of background drift: mean reversion + the structural deficit. */
export function stepMetrics(metrics: NationalMetrics, cfg = METRIC_DRIFT): NationalMetrics {
  const revert = (id: 'gas_price' | 'inflation' | 'border_crossings' | 'conflict_index') =>
    bound(id, metrics[id] + (cfg[id].longRun - metrics[id]) * cfg[id].reversion);
  return {
    gas_price: revert('gas_price'),
    inflation: revert('inflation'),
    border_crossings: revert('border_crossings'),
    conflict_index: revert('conflict_index'),
    national_debt: bound('national_debt', metrics.national_debt + cfg.national_debt.deficitPerTurn),
  };
}

/**
 * Debt comfort follows the baseline deficit path: voters punish debt the
 * player ADDS beyond the structural trend, not the trend itself (otherwise
 * every long game would end in revolt no matter what the player did).
 */
export function debtComfort(turn: number, cfg = METRIC_PRESSURE, drift = METRIC_DRIFT): number {
  return cfg.national_debt.comfort + drift.national_debt.deficitPerTurn * Math.max(0, turn);
}

/** Per-faction satisfaction penalty this turn from metrics above their comfort levels (≤ 0). */
export function metricPressure(
  metrics: NationalMetrics,
  cfg = METRIC_PRESSURE,
  opts: { turn?: number } = {},
): FactionRecord<number> {
  const out = Object.fromEntries(FACTION_IDS.map((f) => [f, 0])) as FactionRecord<number>;
  for (const id of METRIC_IDS) {
    const p = cfg[id];
    const comfort = id === 'national_debt' ? debtComfort(opts.turn ?? 0, cfg) : p.comfort;
    const excess = Math.max(0, metrics[id] - comfort);
    if (excess === 0) continue;
    for (const f of FACTION_IDS) out[f] -= excess * p.perUnit * p.sensitivity[f];
  }
  return out;
}

/** Applies metric pressure nationwide. Voters blame the incumbent, i.e. the player while governing. */
export function applyMetricPressure(
  electorate: ElectorateMap,
  metrics: NationalMetrics,
  turn = 0,
): { electorate: ElectorateMap; effects: AppliedEffect[] } {
  const pressure = metricPressure(metrics, METRIC_PRESSURE, { turn });
  let map = electorate;
  const effects: AppliedEffect[] = [];
  for (const f of FACTION_IDS) {
    if (pressure[f] === 0) continue;
    map = shockFaction(map, f, STATE_CODES, pressure[f]);
    effects.push({ source: 'metric_pressure', sourceId: 'national_metrics', faction: f, satisfactionDelta: pressure[f] });
  }
  return { electorate: map, effects };
}
