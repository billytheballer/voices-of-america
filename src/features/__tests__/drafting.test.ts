import { describe, expect, it } from 'vitest';
import { BillAnalysisSchema } from '@/domain/schemas/billAnalysis.schema';
import { newGame } from '@/engine/loop/newGame';
import { submitBill } from '@/engine/loop/actions';
import { makeBill, NO_AXES } from '@/engine/__tests__/fixtures';
import { heuristicParseBill } from '@/services/llm/mock/heuristicBillParser';
import { LLMError } from '@/services/llm/types';
import { selectBillImpactPreview } from '@/store/selectors';
import type { GameState } from '@/engine/loop/types';
import { EXAMPLE_DRAFTS, FLAG_TEXT, analysisErrorText, impactSentence } from '../bill-drafting/copy';

const game = newGame({ seed: 11, playerName: 'Test', party: 'D', difficulty: 'balanced' });
const president: GameState = { ...game, player: { ...game.player, isPresident: true }, incumbentParty: 'D', phase: 'governing', politicalCapital: 100 };

describe('projected impact of a draft', () => {
  it('is zero for a bill nobody cares about', () => {
    const p = selectBillImpactPreview(game, makeBill());
    expect(Math.abs(p.marginDelta)).toBeLessThan(1e-9);
    expect(Math.abs(p.approvalDelta)).toBeLessThan(1e-9);
  });

  it('pleasing swing voters moves the national margin toward the player', () => {
    const p = selectBillImpactPreview(game, makeBill({ modifiers: { independent: 6, d_moderate: 4 } }));
    expect(p.marginDelta).toBeGreaterThan(0.5);
    expect(p.approvalDelta).toBeGreaterThan(0);
    expect(p.factionDeltas.independent).toBeCloseTo(9, 6); // 6 × modifierScale 1.5
  });

  it('includes deterministic faction rules the analyst may not mention', () => {
    const p = selectBillImpactPreview(game, makeBill({ policy_vector: { ...NO_AXES, social: -9 } }));
    expect(p.rulesTriggered.includes('progressive_suburban_ceiling')).toBe(true);
    expect(p.factionDeltas.independent).toBeLessThan(0);
  });

  it('does not mutate the game, and matches what actually happens if the bill passes', () => {
    const bill = makeBill({ instrument: 'executive_order', modifiers: { independent: 5 } });
    const before = JSON.stringify(president.electorate);
    const preview = selectBillImpactPreview(president, bill);
    expect(JSON.stringify(president.electorate)).toBe(before);
    const after = submitBill(president, bill).state;
    const after2 = selectBillImpactPreview(after, makeBill());
    expect(after2.marginDelta).toBe(0);
    expect(preview.factionDeltas.independent).toBeGreaterThan(0);
  });
});

describe('drafting copy', () => {
  it('every starter draft analyzes into a valid, on-topic bill', () => {
    for (const ex of EXAMPLE_DRAFTS) {
      const a = heuristicParseBill({ text: ex.text, context: { year: 2029, quarter: 1, playerParty: 'D', metrics: game.metrics, currentEvent: 'x' } });
      expect(BillAnalysisSchema.safeParse(a).success).toBe(true);
      expect(a.policy_areas[0]).not.toBe('general');
    }
  });

  it('the gas tax example is recognized as an executive order', () => {
    const ex = EXAMPLE_DRAFTS.find((e) => e.label === 'Gas tax holiday (order)')!;
    const a = heuristicParseBill({ text: ex.text, context: { year: 2029, quarter: 1, playerParty: 'D', metrics: game.metrics, currentEvent: 'x' } });
    expect(a.instrument).toBe('executive_order');
  });

  it('turns every error code into a specific instruction', () => {
    for (const code of ['too_long', 'rate_limited', 'not_configured', 'model_invalid_output', 'network_error', 'forbidden', 'invalid_request', 'upstream_error'] as const) {
      const msg = analysisErrorText(new LLMError(code, 'Could not reach the game server.'));
      expect(msg.length).toBeGreaterThan(20);
      expect(/sorry|oops/i.test(msg)).toBe(false);
    }
    expect(analysisErrorText(new Error('x'))).toBe('The analysis failed unexpectedly. Try again.');
  });

  it('describes impacts and flags in plain language', () => {
    expect(impactSentence('inflation', 'up', 'moderate')).toBe('Core inflation: rises noticeably');
    expect(impactSentence('gas_price', 'none', 'major')).toBe(null);
    expect(Object.values(FLAG_TEXT).every((t) => t.endsWith('.'))).toBe(true);
  });
});
