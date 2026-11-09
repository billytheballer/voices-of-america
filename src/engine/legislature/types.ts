import type { Party, StateCode } from '@/domain/types';
import type { SenateSeat } from '@/data/senateClasses';

/** Party-based (not player-based) so it survives across elections and successors. */
export interface CongressState {
  /** House delegation per state. DC has none. */
  house: Record<StateCode, Record<Party, number>>;
  senate: SenateSeat[];
}

export interface ChamberCounts {
  player: number;
  opposition: number;
}
