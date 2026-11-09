import { SAVE_VERSION, SaveFileSchema } from '@/domain/schemas/saveGame.schema';
import type { GameState } from '@/engine/loop/types';
import type { StorageAdapter } from './storage';
import { defaultCampaign } from '@/engine/campaign/campaign';
import { drawRace, nextPresidentialYear } from '@/engine/campaign/race';
import { defaultDepartments } from '@/engine/government/departments';

export const SAVE_PREFIX = 'voa:save:';
export const SAVE_SLOTS = ['autosave', 'slot-1', 'slot-2', 'slot-3'] as const;
export type SaveSlot = (typeof SAVE_SLOTS)[number];

export type LoadResult =
  | { ok: true; state: GameState; savedAt: string }
  | { ok: false; error: 'not_found' | 'corrupt' | 'incompatible_version'; detail?: string };

/**
 * Migrations from older save versions. Each takes the raw JSON of version N
 * and returns version N+1. Version 1 (the Stage 2 placeholder schema) predates
 * full game state and can't be upgraded.
 */
const MIGRATIONS: Record<number, ((raw: unknown) => unknown) | null> = {
  1: null,
  // v2 → v3 (Stage 13): adds campaign state with defaults.
  2: (raw) => {
    const f = raw as { state: Record<string, unknown> };
    return { ...f, save_version: 3, state: { ...f.state, campaign: defaultCampaign() } };
  },
  // v3 → v4: departments, the opponent field, and negative-campaign state.
  3: (raw) => {
    const f = raw as { state: GameState };
    const st = f.state;
    const race = drawRace(st, nextPresidentialYear(st.year), []);
    return {
      ...f,
      save_version: 4,
      state: {
        ...st,
        campaign: { ...st.campaign, oppoFile: 0, negativity: 0, rapidResponse: false },
        departments: defaultDepartments(),
        // A save already past the convention keeps a nominated opponent (no second home-state bump).
        race: { ...race, nominated: st.phase === 'general_campaign' || st.phase === 'general_election' },
      },
    };
  },
};

export function serialize(state: GameState, savedAt: string): string {
  return JSON.stringify({ save_version: SAVE_VERSION, saved_at: savedAt, state });
}

export function deserialize(json: string): LoadResult {
  let raw: unknown;
  try {
    raw = JSON.parse(json);
  } catch {
    return { ok: false, error: 'corrupt', detail: 'Invalid JSON' };
  }

  let version = (raw as { save_version?: unknown })?.save_version;
  while (typeof version === 'number' && version < SAVE_VERSION) {
    const migrate = MIGRATIONS[version];
    if (!migrate) return { ok: false, error: 'incompatible_version', detail: `v${version}` };
    raw = migrate(raw);
    version = (raw as { save_version?: unknown }).save_version;
  }

  const parsed = SaveFileSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: 'corrupt', detail: parsed.error.issues[0]?.message ?? 'Invalid save' };
  return { ok: true, state: parsed.data.state as GameState, savedAt: parsed.data.saved_at };
}

export function saveGame(adapter: StorageAdapter, slot: SaveSlot, state: GameState, now = new Date()): void {
  adapter.set(SAVE_PREFIX + slot, serialize(state, now.toISOString()));
}

export function loadGame(adapter: StorageAdapter, slot: SaveSlot): LoadResult {
  const json = adapter.get(SAVE_PREFIX + slot);
  return json === null ? { ok: false, error: 'not_found' } : deserialize(json);
}

export function deleteSave(adapter: StorageAdapter, slot: SaveSlot): void {
  adapter.remove(SAVE_PREFIX + slot);
}

export interface SaveSummary {
  slot: SaveSlot;
  savedAt: string;
  candidate: string;
  party: GameState['player']['party'];
  year: number;
  quarter: number;
}

/** Cheap listing for the load menu (skips full validation; loadGame validates). */
export function listSaves(adapter: StorageAdapter): SaveSummary[] {
  const out: SaveSummary[] = [];
  for (const slot of SAVE_SLOTS) {
    const json = adapter.get(SAVE_PREFIX + slot);
    if (!json) continue;
    try {
      const f = JSON.parse(json) as { saved_at: string; state: GameState };
      out.push({
        slot,
        savedAt: f.saved_at,
        candidate: f.state.player.name,
        party: f.state.player.party,
        year: f.state.year,
        quarter: f.state.quarter,
      });
    } catch {
      /* skip unreadable slot */
    }
  }
  return out;
}
