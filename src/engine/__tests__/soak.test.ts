import { describe, expect, it } from 'vitest';
import { DEPARTMENT_IDS, POLICY_AXES, STATE_CODES } from '@/domain/constants';
import { DEPARTMENTS } from '@/data/departments';
import { departmentRejection, performDepartmentAction, type DepartmentAction } from '../government/departments';
import { GameStateSchema } from '@/domain/schemas/saveGame.schema';
import { FACTIONS } from '@/data/factions';
import { WINGS } from '@/data/campaign';
import { newGame } from '../loop/newGame';
import { billRejection, endTurn, submitBill } from '../loop/actions';
import { campaignRejection, debateAvailable, debateTopics, performCampaignAction, type CampaignAction } from '../campaign/campaign';
import { createRng } from '../rng';
import type { GameState } from '../loop/types';
import { makeBill } from './fixtures';

/**
 * Soak test: whole games with randomized but legal actions every turn. Catches
 * crashes and invalid states that only appear deep into a long game.
 */
function play(seed: number, turns: number): { state: GameState; actions: number } {
  const rng = createRng(seed * 7919);
  let g = newGame({ seed, playerName: 'Soak', party: seed % 2 ? 'D' : 'R', difficulty: (['realistic', 'balanced', 'hard'] as const)[seed % 3] ?? 'balanced' });
  let actions = 0;
  for (let t = 0; t < turns && !g.gameOver; t++) {
    // Campaign moves
    const wings = WINGS[g.player.party];
    const candidates: CampaignAction[] = [
      { type: 'fundraise' },
      { type: 'rally', state: STATE_CODES[rng.int(0, STATE_CODES.length - 1)]! },
      { type: 'ad', state: STATE_CODES[rng.int(0, STATE_CODES.length - 1)]!, amount: 5 * rng.int(1, 8) },
      { type: 'pledge', faction: [wings.base, wings.core, wings.moderate][rng.int(0, 2)]! },
      { type: 'name_successor', name: `Heir ${t}` },
      { type: 'attack_record', axis: POLICY_AXES[rng.int(0, POLICY_AXES.length - 1)]! },
      { type: 'oppo_research' },
      { type: 'release_oppo' },
      { type: 'rapid_response' },
      { type: 'ad', state: STATE_CODES[rng.int(0, STATE_CODES.length - 1)]!, amount: 10, tone: 'negative' },
    ];
    if (debateAvailable(g)) {
      candidates.push({ type: 'debate', answers: debateTopics(g).map((x) => ({ topic: x.id, style: (['base', 'center', 'attack'] as const)[rng.int(0, 2)]! })) });
    }
    for (const a of candidates) {
      if (rng.next() < 0.6 && !campaignRejection(g, a)) {
        g = performCampaignAction(g, a).state;
        actions++;
      }
    }
    // Legislation
    const bill = makeBill({
      instrument: rng.next() < 0.3 ? 'executive_order' : 'legislation',
      radical_score: rng.int(1, 10),
      programmatic_score: rng.int(1, 10),
      modifiers: Object.fromEntries(Object.keys(FACTIONS).map((f) => [f, rng.int(-6, 6)])),
      policy_vector: { economic: rng.int(-10, 10), trade: null, foreign_policy: rng.int(-10, 10), immigration: null, social: rng.int(-10, 10), institutional: null },
      flags: { ...makeBill().flags, reconciliation_eligible: rng.next() < 0.4, foreign_aid_blank_check: rng.next() < 0.2 },
    });
    // Departments
    const dept = DEPARTMENT_IDS[rng.int(0, DEPARTMENT_IDS.length - 1)]!;
    const dirs = DEPARTMENTS[dept].directives;
    const deptActions: DepartmentAction[] = [
      { type: 'expand', dept },
      { type: 'cut', dept },
      { type: 'abolish', dept },
      { type: 'restore', dept },
      { type: 'rescind', dept },
      { type: 'directive', dept, directive: dirs[rng.int(0, dirs.length - 1)]!.id },
    ];
    for (const a of deptActions) {
      if (rng.next() < 0.4 && !departmentRejection(g, a, { reconciliation: true })) {
        g = performDepartmentAction(g, a, { reconciliation: true }).state;
        actions++;
      }
    }
    if (!billRejection(g, bill)) {
      g = submitBill(g, bill, { whipCapital: 0, reconciliation: rng.next() < 0.5 }).state;
      actions++;
    }
    g = endTurn(g);
    const valid = GameStateSchema.safeParse(JSON.parse(JSON.stringify(g)));
    if (!valid.success) throw new Error(`Invalid state at turn ${g.turn}: ${valid.error.issues[0]?.path.join('.')} ${valid.error.issues[0]?.message}`);
  }
  return { state: g, actions };
}

describe('soak', () => {
  it('long games with random legal actions never crash or produce an invalid state', () => {
    let totalTurns = 0;
    let totalActions = 0;
    for (let seed = 1; seed <= 6; seed++) {
      const { state, actions } = play(seed, 48);
      totalTurns += state.turn;
      totalActions += actions;
      expect(state.politicalCapital).toBeGreaterThanOrEqual(0);
      expect(state.campaign.funds).toBeGreaterThanOrEqual(0);
    }
    expect(totalTurns).toBeGreaterThan(30);
    expect(totalActions).toBeGreaterThan(50);
  });
});
