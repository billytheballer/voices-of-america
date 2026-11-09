import { STATE_CODES } from '@/domain/constants';
import { STATES } from '@/data/states';
import { deriveStateElectorate } from '@/data/derive/stateElectorate';
import type { ElectorateMap } from '../types';

/** Opening electorate for every state, derived from the state profiles. */
export function buildInitialElectorate(): ElectorateMap {
  return Object.fromEntries(STATE_CODES.map((s) => [s, deriveStateElectorate(STATES[s])])) as ElectorateMap;
}
