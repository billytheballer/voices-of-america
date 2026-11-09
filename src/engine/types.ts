import type { FactionId, Party, PolicyVector, StateCode } from '@/domain/types';
import type { StateElectorate } from '@/data/derive/stateElectorate';

/** Every state's 8-faction electorate. The core mutable (but immutably updated) game state. */
export type ElectorateMap = Record<StateCode, StateElectorate>;

/** Everything vote math needs besides the electorate itself. */
export interface ElectionContext {
  playerParty: Party;
  playerPlatform: PolicyVector;
  oppositionPlatform: PolicyVector;
  /** Midterms: lower turnout + incumbent-party falloff. */
  isMidterm: boolean;
  /** Party holding the White House (for the midterm penalty); null before the first inauguration. */
  incumbentParty: Party | null;
}

/** One entry in the audit trail shown in the UI ("why did Ohio move?"). */
export interface AppliedEffect {
  source: 'llm_modifier' | 'state_override' | 'rule' | 'event' | 'metric_pressure';
  sourceId: string;
  faction: FactionId;
  /** Omitted = nationwide. */
  states?: readonly StateCode[];
  satisfactionDelta: number;
  turnoutDelta?: number;
}
