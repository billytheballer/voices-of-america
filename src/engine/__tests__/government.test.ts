import { describe, expect, it } from 'vitest';
import { DEPARTMENT_IDS, STATE_CODES } from '@/domain/constants';
import { BillAnalysisSchema } from '@/domain/schemas/billAnalysis.schema';
import { DEPARTMENTS, DEPARTMENT_LIST } from '@/data/departments';
import { GAME_LOOP } from '@/data/balance.config';
import { nationalFactionSatisfaction } from '../electorate/approval';
import { newGame } from '../loop/newGame';
import { asExecutiveOrder, endTurn, slotsLeft, submitBill } from '../loop/actions';
import { executiveOrderSurvival } from '../legislature/passage';
import {
  currentWork,
  departmentAnalysis,
  departmentBudget,
  departmentRejection,
  performDepartmentAction,
  type DepartmentAction,
} from '../government/departments';
import type { GameState } from '../loop/types';
import { makeBill } from './fixtures';

/** A sitting president in an ordinary governing quarter, with plenty of capital. */
const president = (seed = 3): GameState => {
  const g = newGame({ seed, playerName: 'Sam Lee', party: 'R' });
  return {
    ...g,
    year: 2029,
    quarter: 2,
    phase: 'governing',
    politicalCapital: 100,
    player: { ...g.player, isPresident: true, termsServed: 1 },
    incumbentParty: 'R',
  };
};

/** Runs an action until it succeeds (orders can be struck down; bills can fail). */
function untilEnacted(g: GameState, a: DepartmentAction, opts = {}) {
  for (let seed = 0; seed < 200; seed++) {
    const r = performDepartmentAction({ ...g, rngState: seed * 7919 + 1 }, a, opts);
    if (r.outcome.status === 'enacted' || r.outcome.status === 'executive_order_upheld') return r;
  }
  throw new Error('never enacted');
}

describe('department data', () => {
  it('covers every department, with valid directives', () => {
    expect(DEPARTMENT_LIST.length).toBe(DEPARTMENT_IDS.length);
    for (const d of DEPARTMENT_LIST) {
      expect(d.directives.length).toBeGreaterThanOrEqual(2);
      expect(new Set(d.directives.map((x) => x.id)).size).toBe(d.directives.length);
      for (const x of d.directives) {
        expect(x.radical).toBeGreaterThanOrEqual(1);
        expect(x.radical).toBeLessThanOrEqual(10);
      }
    }
  });

  it('every generated action is a valid BillAnalysis', () => {
    const g = president();
    for (const id of DEPARTMENT_IDS) {
      const actions: DepartmentAction[] = [
        { type: 'expand', dept: id },
        { type: 'cut', dept: id },
        { type: 'abolish', dept: id },
        ...DEPARTMENTS[id].directives.map((d) => ({ type: 'directive' as const, dept: id, directive: d.id })),
      ];
      for (const a of actions) {
        const parsed = BillAnalysisSchema.safeParse(departmentAnalysis(g, a));
        expect(parsed.success).toBe(true);
      }
    }
  });
});

describe('department actions', () => {
  it('directives are executive orders that use the order slot, not the bill slot', () => {
    const g = president();
    const a: DepartmentAction = { type: 'directive', dept: 'energy', directive: 'spr_release' };
    expect(departmentAnalysis(g, a).instrument).toBe('executive_order');
    const r = untilEnacted(g, a);
    expect(r.state.departments.energy.directive).toBe('spr_release');
    expect(slotsLeft(r.state).order).toBe(GAME_LOOP.maxOrdersPerTurn - 1);
    expect(slotsLeft(r.state).bill).toBe(GAME_LOOP.maxBillsPerTurn);
    expect(r.state.metrics.gas_price).toBeLessThan(g.metrics.gas_price);
    expect(currentWork(r.state, 'energy')[0]).toBe(`Priority: ${DEPARTMENTS.energy.directives[2]!.work}`);
  });

  it('a second order the same quarter is allowed, a third is not', () => {
    let g = president();
    g = performDepartmentAction(g, { type: 'directive', dept: 'transportation', directive: 'roads_bridges' }).state;
    g = performDepartmentAction(g, { type: 'directive', dept: 'labor', directive: 'apprenticeships' }).state;
    expect(departmentRejection(g, { type: 'directive', dept: 'justice', directive: 'fentanyl' })).toBe('order_limit_reached');
  });

  it('a bill and a budget request can both go in the same quarter', () => {
    let g = president();
    g = submitBill(g, makeBill({ radical_score: 2 })).state;
    expect(departmentRejection(g, { type: 'expand', dept: 'va' })).toBe(null);
    g = performDepartmentAction(g, { type: 'expand', dept: 'va' }).state;
    expect(departmentRejection(g, { type: 'cut', dept: 'epa' })).toBe('budget_limit_reached');
  });

  it('budget requests move the level and the budget; factions react by their support', () => {
    const g = president();
    const r = untilEnacted(g, { type: 'cut', dept: 'epa' }, { reconciliation: true });
    expect(r.state.departments.epa.level).toBe(-1);
    expect(departmentBudget(DEPARTMENTS.epa, r.state.departments.epa)).toBeLessThan(DEPARTMENTS.epa.budget);
    const before = nationalFactionSatisfaction(g.electorate);
    const after = nationalFactionSatisfaction(r.state.electorate);
    expect(after.r_america_first).toBeGreaterThan(before.r_america_first);
    expect(after.d_progressive).toBeLessThan(before.d_progressive);
  });

  it('refuses impossible changes', () => {
    const g = president();
    const maxed = { ...g, departments: { ...g.departments, dhs: { level: 2 as const, abolished: false, directive: null } } };
    expect(departmentRejection(maxed, { type: 'expand', dept: 'dhs' })).toBe('at_max_level');
    expect(departmentRejection(g, { type: 'abolish', dept: 'defense' })).toBe('not_abolishable');
    expect(departmentRejection(g, { type: 'restore', dept: 'education' })).toBe('not_abolished');
    expect(departmentRejection(g, { type: 'rescind', dept: 'education' })).toBe('no_directive');
    const candidate = { ...g, player: { ...g.player, isPresident: false } };
    expect(departmentRejection(candidate, { type: 'directive', dept: 'dhs', directive: 'border_surge' })).toBe('not_president');
  });

  it('abolishing is radical legislation; once gone, its orders are unavailable until restored', () => {
    const g = president();
    const bill = departmentAnalysis(g, { type: 'abolish', dept: 'education' });
    expect(bill.instrument).toBe('legislation');
    expect(bill.radical_score).toBeGreaterThanOrEqual(8);
    expect(bill.flags.reconciliation_eligible).toBe(false);
    const gone = { ...g, departments: { ...g.departments, education: { level: 0 as const, abolished: true, directive: null } } };
    expect(departmentRejection(gone, { type: 'directive', dept: 'education', directive: 'loan_pause' })).toBe('abolished');
    expect(departmentRejection(gone, { type: 'expand', dept: 'education' })).toBe('abolished');
    expect(departmentBudget(DEPARTMENTS.education, gone.departments.education)).toBe(0);
    expect(currentWork(gone, 'education')[0]).toContain('Eliminated');
  });

  it('a struck-down order leaves the department unchanged', () => {
    const g = president();
    for (let seed = 0; seed < 200; seed++) {
      const r = performDepartmentAction({ ...g, rngState: seed + 11 }, { type: 'directive', dept: 'education', directive: 'loan_pause' });
      if (r.outcome.status === 'executive_order_struck_down') {
        expect(r.state.departments.education.directive).toBe(null);
        return;
      }
    }
    throw new Error('never struck down');
  });

  it('department state survives the end of a turn', () => {
    const r = untilEnacted(president(), { type: 'directive', dept: 'dhs', directive: 'border_surge' });
    const next = endTurn(r.state);
    expect(next.departments.dhs.directive).toBe('border_surge');
    expect(next.turnBills.length).toBe(0);
    expect(STATE_CODES.length).toBe(51);
  });

  it('any drafted bill can be signed as an executive order instead, with court risk for spending', () => {
    const spend = makeBill({ radical_score: 4, flags: { ...makeBill().flags, deficit_financed: true } });
    const eo = asExecutiveOrder(spend);
    expect(eo.instrument).toBe('executive_order');
    expect(eo.flags.exceeds_executive_authority).toBe(true);
    expect(executiveOrderSurvival(eo)).toBeLessThan(0.6);
    const g = submitBill(president(), eo).state;
    expect(slotsLeft(g).order).toBe(GAME_LOOP.maxOrdersPerTurn - 1);
    expect(slotsLeft(g).bill).toBe(GAME_LOOP.maxBillsPerTurn);
  });
});
