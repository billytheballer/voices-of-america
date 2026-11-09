import { createStore, type StoreApi } from 'zustand/vanilla';
import { useStore } from 'zustand';
import { endTurn, submitBill } from '@/engine/loop/actions';
import { newGame } from '@/engine/loop/newGame';
import { performCampaignAction, type CampaignAction } from '@/engine/campaign/campaign';
import { performDepartmentAction, type DepartmentAction } from '@/engine/government/departments';
import type {
  BillAnalysis,
  GameState,
  NewGameOptions,
  SubmitBillOptions,
  SubmitBillResult,
} from '@/engine/loop/types';
import { loadGame, saveGame, type LoadResult, type SaveSlot } from '@/services/persistence/saveGame';
import { localStorageAdapter, type StorageAdapter } from '@/services/persistence/storage';

/**
 * The store is deliberately thin: every action delegates to a pure engine
 * function and stores the returned GameState. All game logic stays testable
 * without React, and the store only adds persistence and UI-facing results.
 */
export interface GameStore {
  game: GameState | null;
  /** Result of the most recent bill (with its analysis), for the result card and the voter feed. */
  lastBill: (SubmitBillResult & { bill: BillAnalysis; turn: number }) | null;
  error: string | null;

  newGame: (opts: NewGameOptions) => void;
  submitBill: (bill: BillAnalysis, opts?: SubmitBillOptions) => SubmitBillResult | null;
  /** A department budget request, elimination, or executive directive. */
  department: (action: DepartmentAction, opts?: SubmitBillOptions) => SubmitBillResult | null;
  /** Runs a campaign action; returns its plain-English result, or null if refused. */
  campaign: (action: CampaignAction) => string | null;
  endTurn: () => void;
  save: (slot: SaveSlot) => void;
  load: (slot: SaveSlot) => LoadResult;
  quit: () => void;
  clearError: () => void;
}

export function createGameStore(adapter: StorageAdapter = localStorageAdapter): StoreApi<GameStore> {
  return createStore<GameStore>()((set, get) => {
    const autosave = (game: GameState) => {
      try {
        saveGame(adapter, 'autosave', game);
      } catch {
        /* storage full or unavailable: autosave is best-effort */
      }
    };

    return {
      game: null,
      lastBill: null,
      error: null,

      newGame: (opts) => {
        const game = newGame(opts);
        set({ game, lastBill: null, error: null });
        autosave(game);
      },

      submitBill: (bill, opts) => {
        const { game } = get();
        if (!game) return null;
        try {
          const result = submitBill(game, bill, opts);
          set({ game: result.state, lastBill: { ...result, bill, turn: game.turn }, error: null });
          return result;
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) });
          return null;
        }
      },

      department: (action, opts) => {
        const { game } = get();
        if (!game) return null;
        try {
          const { bill, ...result } = performDepartmentAction(game, action, opts);
          set({ game: result.state, lastBill: { ...result, bill, turn: game.turn }, error: null });
          autosave(result.state);
          return result;
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) });
          return null;
        }
      },

      campaign: (action) => {
        const { game } = get();
        if (!game) return null;
        try {
          const { state, message } = performCampaignAction(game, action);
          set({ game: state, error: null });
          autosave(state);
          return message;
        } catch (e) {
          set({ error: e instanceof Error ? e.message : String(e) });
          return null;
        }
      },

      endTurn: () => {
        const { game } = get();
        if (!game) return;
        const next = endTurn(game);
        set({ game: next, lastBill: null });
        autosave(next);
      },

      save: (slot) => {
        const { game } = get();
        if (game) saveGame(adapter, slot, game);
      },

      load: (slot) => {
        const result = loadGame(adapter, slot);
        if (result.ok) set({ game: result.state, lastBill: null, error: null });
        else set({ error: `Could not load ${slot}: ${result.error}` });
        return result;
      },

      quit: () => set({ game: null, lastBill: null, error: null }),
      clearError: () => set({ error: null }),
    };
  });
}

/** App-wide store instance (localStorage-backed). */
export const gameStore = createGameStore();

/** React hook: `const year = useGameStore((s) => s.game?.year)`. */
export function useGameStore<T>(selector: (s: GameStore) => T): T {
  return useStore(gameStore, selector);
}
