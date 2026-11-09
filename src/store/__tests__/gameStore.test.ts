import { describe, expect, it } from 'vitest';
import { createMemoryAdapter } from '@/services/persistence/storage';
import { makeBill } from '@/engine/__tests__/fixtures';
import { createGameStore } from '../gameStore';

describe('game store', () => {
  it('starts a game, ends turns, and autosaves', () => {
    const storage = createMemoryAdapter();
    const store = createGameStore(storage);
    store.getState().newGame({ seed: 1, playerName: 'Alex', party: 'D' });
    expect(store.getState().game?.year).toBe(2028);
    store.getState().endTurn();
    expect(store.getState().game?.quarter).toBe(2);
    expect(storage.keys().some((k) => k.endsWith('autosave'))).toBe(true);
  });

  it('surfaces rejected bills as an error instead of throwing', () => {
    const store = createGameStore(createMemoryAdapter());
    store.getState().newGame({ seed: 1, playerName: 'Alex', party: 'D' });
    expect(store.getState().submitBill(makeBill())).toBe(null);
    expect(store.getState().error).toBe('Bill rejected: not_president');
  });

  it('saves and loads slots', () => {
    const storage = createMemoryAdapter();
    const a = createGameStore(storage);
    a.getState().newGame({ seed: 9, playerName: 'Alex', party: 'R' });
    a.getState().endTurn();
    a.getState().save('slot-1');
    const b = createGameStore(storage);
    expect(b.getState().load('slot-1').ok).toBe(true);
    expect(b.getState().game).toEqual(a.getState().game);
  });
});
