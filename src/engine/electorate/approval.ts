import { FACTION_IDS, STATE_CODES } from '@/domain/constants';
import type { FactionRecord } from '@/domain/types';
import type { ElectorateMap } from '../types';
import { stateVoterWeight } from './voteShare';

/**
 * National approval of the player's party, 0–1: the population-weighted mean
 * satisfaction across every state and faction. Drives political-capital regen.
 */
export function nationalApproval(electorate: ElectorateMap): number {
  let num = 0;
  let den = 0;
  for (const s of STATE_CODES) {
    const w = stateVoterWeight(s);
    for (const f of FACTION_IDS) {
      const e = electorate[s][f];
      num += w * e.weight * e.satisfaction;
      den += w * e.weight;
    }
  }
  return num / den / 100;
}

/** National mean satisfaction per faction, 0–100 (for the coalition drill-down). */
export function nationalFactionSatisfaction(electorate: ElectorateMap): FactionRecord<number> {
  const out = {} as FactionRecord<number>;
  for (const f of FACTION_IDS) {
    let num = 0;
    let den = 0;
    for (const s of STATE_CODES) {
      const w = stateVoterWeight(s) * electorate[s][f].weight;
      num += w * electorate[s][f].satisfaction;
      den += w;
    }
    out[f] = num / den;
  }
  return out;
}
