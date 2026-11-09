import { FACTIONS } from '@/data/factions';
import { TURNOUT } from '@/data/balance.config';
import type { FactionElectorate } from '@/data/derive/stateElectorate';
import type { FactionId, Party } from '@/domain/types';
import { clamp } from '@/lib/math';

export interface TurnoutOptions {
  isMidterm: boolean;
  incumbentParty: Party | null;
}

/**
 * Probability a faction member votes.
 *
 * Enthusiasm is |sat − 50| / 50: a faction that loves you OR hates you shows
 * up; an indifferent one stays home. Elasticity scales how much that matters
 * (Progressives and America First swing hard; Establishment wings barely move).
 */
export function factionTurnout(
  faction: FactionId,
  e: FactionElectorate,
  { isMidterm, incumbentParty }: TurnoutOptions,
  cfg = TURNOUT,
): number {
  const def = FACTIONS[faction];
  const enthusiasm = Math.abs(e.satisfaction - 50) / 50;
  let t = e.baseTurnout + def.turnoutElasticity * cfg.enthusiasmSwing * (enthusiasm - 0.25) + e.turnoutShift;

  if (isMidterm) {
    t *= cfg.midtermFactor;
    if (incumbentParty !== null && def.homeParty === incumbentParty) t -= cfg.midtermIncumbentPenalty;
  }
  return clamp(t, cfg.min, cfg.max);
}
