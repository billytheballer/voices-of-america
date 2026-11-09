import { describe, expect, it } from 'vitest';
import { newGame } from '@/engine/loop/newGame';
import { endTurn } from '@/engine/loop/actions';
import { createMemoryAdapter } from '../storage';
import { deserialize, listSaves, loadGame, saveGame, SAVE_PREFIX, serialize } from '../saveGame';

const game = () => {
  let g = newGame({ seed: 7, playerName: 'Sam Okoye', party: 'R', difficulty: 'balanced' });
  for (let i = 0; i < 6; i++) g = endTurn(g);
  return g;
};

describe('save / load', () => {
  it('round-trips the full game state exactly', () => {
    const g = game();
    const r = deserialize(serialize(g, '2028-07-01T00:00:00.000Z'));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state).toEqual(g);
  });

  it('a loaded game continues identically', () => {
    const g = game();
    const r = deserialize(serialize(g, 'now'));
    if (!r.ok) throw new Error('load failed');
    expect(endTurn(r.state)).toEqual(endTurn(g));
  });

  it('rejects corrupt JSON, tampered state and old versions', () => {
    expect(deserialize('{not json').ok).toBe(false);
    const tampered = JSON.parse(serialize(game(), 'now'));
    tampered.state.politicalCapital = 9999;
    expect(deserialize(JSON.stringify(tampered))).toEqual(expect.objectContaining({ ok: false, error: 'corrupt' }));
    expect(deserialize(JSON.stringify({ save_version: 1 }))).toEqual(
      expect.objectContaining({ ok: false, error: 'incompatible_version' }),
    );
  });

  it('uses slots on a storage adapter and lists them', () => {
    const store = createMemoryAdapter();
    saveGame(store, 'slot-1', game(), new Date('2026-01-01'));
    expect(store.keys()).toEqual([`${SAVE_PREFIX}slot-1`]);
    expect(loadGame(store, 'slot-2')).toEqual({ ok: false, error: 'not_found' });
    expect(loadGame(store, 'slot-1').ok).toBe(true);
    expect(listSaves(store)[0]).toEqual(expect.objectContaining({ slot: 'slot-1', candidate: 'Sam Okoye', party: 'R' }));
  });
});

describe('save migrations', () => {
  it('upgrades a v2 save (before campaigns) to v3 with default campaign state', () => {
    const g = game();
    const { campaign: _drop, ...v2State } = g;
    const v2 = JSON.stringify({ save_version: 2, saved_at: 'then', state: v2State });
    const r = deserialize(v2);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.state.campaign.funds).toBe(60);
  });

  it('upgrades a v3 save (before departments and named opponents) to v4', () => {
    const g = game();
    const { departments: _d, race: _r, ...v3State } = g;
    const { oppoFile: _o, negativity: _n, rapidResponse: _rr, ...v3Campaign } = g.campaign;
    const v3 = JSON.stringify({ save_version: 3, saved_at: 'then', state: { ...v3State, campaign: v3Campaign } });
    const r = deserialize(v3);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.state.departments.dhs.level).toBe(0);
      expect(r.state.race.opponent.party).not.toBe(r.state.player.party);
      expect(r.state.campaign.oppoFile).toBe(0);
    }
  });
});
