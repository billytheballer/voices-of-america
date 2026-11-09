import { describe, expect, it } from 'vitest';
import { BillAnalysisSchema } from '@/domain/schemas/billAnalysis.schema';
import { DEMO_BILLS } from '../demoBills';

describe('demo bills', () => {
  it('every prepared bill is a valid BillAnalysis (same contract as the LLM)', () => {
    for (const b of DEMO_BILLS) {
      const r = BillAnalysisSchema.safeParse(b.analysis);
      expect(r.success).toBe(true);
    }
  });

  it('ids are unique and the set spans both sides of the spectrum', () => {
    expect(new Set(DEMO_BILLS.map((b) => b.id)).size).toBe(DEMO_BILLS.length);
    const econ = DEMO_BILLS.map((b) => b.analysis.policy_vector.economic).filter((v): v is number => v !== null);
    expect(Math.min(...econ)).toBeLessThan(-5);
    expect(Math.max(...econ)).toBeGreaterThan(5);
  });
});
