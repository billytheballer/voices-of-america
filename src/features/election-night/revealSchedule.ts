import { STATE_CODES } from '@/domain/constants';
import type { StateCode } from '@/domain/types';
import { STATES } from '@/data/states';
import { TILES } from '@/data/tileGrid';
import type { ElectionRecord } from '@/engine/loop/types';

/** Distinct poll-closing hours, earliest first: the beats of the election-night reveal. */
export const CLOSING_HOURS: number[] = [...new Set(STATE_CODES.map((s) => TILES[s].pollClose))].sort((a, b) => a - b);

const unitEV = (id: string) => (id.endsWith('-AL') ? 2 : id.includes('-') ? 1 : STATES[id as StateCode].electoralVotes);

export interface RevealFrame {
  /** ET hour of the latest poll closing included. */
  hour: number;
  revealed: Set<StateCode>;
  /** States called at this beat (newest first for the ticker). */
  justCalled: StateCode[];
  playerEV: number;
  oppositionEV: number;
}

/**
 * Frame `k` of election night (0 = first closing). EV tallies come from the
 * recorded EV-unit margins, so ME/NE districts are counted exactly and the final
 * frame matches the official result.
 */
export function revealFrame(record: ElectionRecord, k: number): RevealFrame {
  const hour = CLOSING_HOURS[Math.min(k, CLOSING_HOURS.length - 1)]!;
  const revealed = new Set(STATE_CODES.filter((s) => TILES[s].pollClose <= hour));
  const justCalled = STATE_CODES.filter((s) => TILES[s].pollClose === hour).sort(
    (a, b) => STATES[b].electoralVotes - STATES[a].electoralVotes,
  );
  let playerEV = 0;
  let oppositionEV = 0;
  const units = record.unitMargins ?? Object.fromEntries(STATE_CODES.map((s) => [s, record.stateMargins[s]]));
  for (const [id, margin] of Object.entries(units)) {
    if (!revealed.has(id.slice(0, 2) as StateCode)) continue;
    if (margin > 0) playerEV += unitEV(id);
    else oppositionEV += unitEV(id);
  }
  return { hour, revealed, justCalled, playerEV, oppositionEV };
}
