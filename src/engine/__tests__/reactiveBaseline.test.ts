import { describe, expect, it } from 'vitest';
import { FACTION_LIST } from '@/data/factions';
import type { PolicyVector, SparsePolicyVector } from '@/domain/types';
import {
  axisProvocation,
  computeOppositionTarget,
  computePartyAnchor,
  stepOppositionPlatform,
  updatePlayerPlatform,
} from '../opposition/reactiveBaseline';
import { OPPOSITION } from '@/data/balance.config';

const R_ANCHOR = computePartyAnchor('R', FACTION_LIST);
const D_ANCHOR = computePartyAnchor('D', FACTION_LIST);

const untouched: SparsePolicyVector = {
  economic: null, trade: null, foreign_policy: null, immigration: null, social: null, institutional: null,
};

/** Run N identical turns of the full player→opposition loop. */
function simulate(
  start: PolicyVector,
  oppAnchor: PolicyVector,
  bill: { policy_vector: SparsePolicyVector; radical_score: number },
  turns: number,
) {
  let player = start;
  let opp = oppAnchor;
  for (let t = 0; t < turns; t++) {
    player = updatePlayerPlatform(player, bill);
    opp = stepOppositionPlatform(opp, player, oppAnchor);
  }
  return { player, opp };
}

describe('party anchors', () => {
  it('places the GOP right of the Democrats on economics, immigration and social axes', () => {
    expect(R_ANCHOR.economic).toBeGreaterThan(D_ANCHOR.economic);
    expect(R_ANCHOR.immigration).toBeGreaterThan(D_ANCHOR.immigration);
    expect(R_ANCHOR.social).toBeGreaterThan(D_ANCHOR.social);
  });
});

describe('reactive opposition', () => {
  it('Dem player pushing DSA economics → GOP baseline shifts toward fiscal conservatism', () => {
    const dsaBill = { policy_vector: { ...untouched, economic: -9 }, radical_score: 9 };
    const { player, opp } = simulate(D_ANCHOR, R_ANCHOR, dsaBill, 8);
    expect(player.economic).toBeLessThan(D_ANCHOR.economic);
    expect(opp.economic).toBeGreaterThan(R_ANCHOR.economic);
  });

  it('GOP player running America First trade → Dem baseline shifts globalist', () => {
    const tariffBill = { policy_vector: { ...untouched, trade: 9 }, radical_score: 7 };
    const { opp } = simulate(R_ANCHOR, D_ANCHOR, tariffBill, 8);
    expect(opp.trade).toBeLessThan(D_ANCHOR.trade - 2);
  });

  it('does not react on axes below the salience threshold', () => {
    const player = { ...D_ANCHOR, foreign_policy: 2 };
    const target = computeOppositionTarget(player, R_ANCHOR);
    expect(target.foreign_policy).toBeCloseTo(R_ANCHOR.foreign_policy);
  });

  it('never leaves the corridor around its anchor', () => {
    const extreme: PolicyVector = {
      economic: 10, trade: 10, foreign_policy: 10, immigration: 10, social: 10, institutional: 10,
    };
    const target = computeOppositionTarget(extreme, D_ANCHOR, { ...OPPOSITION, mirrorStrength: 1 });
    for (const axis of Object.keys(target) as (keyof PolicyVector)[]) {
      expect(Math.abs(target[axis] - D_ANCHOR[axis])).toBeLessThanOrEqual(OPPOSITION.corridor + 1e-9);
    }
  });

  it('is deterministic', () => {
    const bill = { policy_vector: { ...untouched, immigration: 8, trade: 6 }, radical_score: 6 };
    expect(simulate(R_ANCHOR, D_ANCHOR, bill, 5)).toEqual(simulate(R_ANCHOR, D_ANCHOR, bill, 5));
  });

  it('leaves untouched axes of the player platform alone', () => {
    const next = updatePlayerPlatform(D_ANCHOR, { policy_vector: { ...untouched, trade: 5 }, radical_score: 5 });
    expect(next.social).toBe(D_ANCHOR.social);
    expect(next.trade).not.toBe(D_ANCHOR.trade);
  });

  it('provocation ramps 0 → 1 between threshold and extreme', () => {
    expect(axisProvocation(2, 3)).toBe(0);
    expect(axisProvocation(-10, 3)).toBe(1);
    expect(axisProvocation(6.5, 3)).toBeCloseTo(0.5);
  });
});
