import { LEGISLATURE } from '@/data/balance.config';
import type { BillAnalysis } from '@/domain/schemas/billAnalysis.schema';
import { clamp } from '@/lib/math';

/**
 * Political capital: the currency for getting radical ideas to a vote.
 * Mainstream bills (radical ≤ 3) cost only the base fee; every point above
 * that costs more. Executive orders cost half but face court risk.
 */
export function capitalCost(bill: Pick<BillAnalysis, 'radical_score' | 'instrument'>, cfg = LEGISLATURE): number {
  const { base, perRadicalPoint, freeThreshold } = cfg.capitalCost;
  const full = base + perRadicalPoint * Math.max(0, bill.radical_score - freeThreshold);
  return bill.instrument === 'executive_order' ? Math.round(full * cfg.executiveOrderCostFactor) : full;
}

export function canAfford(capital: number, bill: Pick<BillAnalysis, 'radical_score' | 'instrument'>, whip = 0): boolean {
  return capital >= capitalCost(bill) + whip;
}

/** Spends capital; throws if unaffordable (the UI should have blocked it). */
export function spendCapital(capital: number, amount: number): number {
  if (amount > capital) throw new Error(`Insufficient political capital: need ${amount}, have ${capital}`);
  return capital - amount;
}

/** Per-turn regeneration, scaled by national approval (0–1). Popular presidents get more done. */
export function regenerateCapital(capital: number, approval: number, cfg = LEGISLATURE): number {
  const { base, minFactor, approvalFactor } = cfg.capitalRegen;
  const gain = base * (minFactor + approvalFactor * clamp(approval, 0, 1));
  return clamp(capital + gain, 0, cfg.capitalMax);
}
