import { DEPARTMENT_IDS, FACTION_IDS, METRIC_IDS, POLICY_AXES } from '@/domain/constants';
import type { DepartmentId, DepartmentLevel, FactionId, MetricId, PolicyAxis, SparsePolicyVector } from '@/domain/types';
import type { BillAnalysis, BillFlag } from '@/domain/schemas/billAnalysis.schema';
import { BILL_FLAGS } from '@/domain/schemas/billAnalysis.schema';
import { DEPARTMENTS, DEPARTMENT_RULES, LEVEL_WORK, type DepartmentSpec, type DirectiveSpec } from '@/data/departments';
import { clamp } from '@/lib/math';
import { billRejection, submitBill } from '../loop/actions';
import type { BillRejection, DepartmentState, GameState, SubmitBillOptions, SubmitBillResult } from '../loop/types';

/**
 * Department actions. Each one is turned into a BillAnalysis and sent through
 * the same pipeline as a bill the player writes (capital, roll call or courts,
 * faction effects, metrics, platform), then the department's own state is
 * updated if it went through.
 *
 *   expand / cut       budget request to Congress (reconciliation-eligible)
 *   abolish / restore  legislation (needs 60 in the Senate)
 *   directive          executive order setting the department's priority
 *   rescind            executive order withdrawing the current directive
 */
export type DepartmentAction =
  | { type: 'expand' | 'cut' | 'abolish' | 'restore' | 'rescind'; dept: DepartmentId }
  | { type: 'directive'; dept: DepartmentId; directive: string };

export type DepartmentRejection =
  | BillRejection
  | 'abolished'
  | 'not_abolished'
  | 'not_abolishable'
  | 'at_max_level'
  | 'at_min_level'
  | 'unknown_directive'
  | 'directive_active'
  | 'no_directive';

export const defaultDepartments = (): Record<DepartmentId, DepartmentState> =>
  Object.fromEntries(DEPARTMENT_IDS.map((d) => [d, { level: 0, abolished: false, directive: null }])) as Record<
    DepartmentId,
    DepartmentState
  >;

export const departmentBudget = (spec: DepartmentSpec, dept: DepartmentState) =>
  dept.abolished ? 0 : spec.budget * (1 + DEPARTMENT_RULES.levelStep * dept.level);

export const findDirective = (dept: DepartmentId, id: string | null): DirectiveSpec | undefined =>
  id === null ? undefined : DEPARTMENTS[dept].directives.find((d) => d.id === id);

/** What the department is working on right now, for the UI. */
export function currentWork(g: GameState, dept: DepartmentId): string[] {
  const spec = DEPARTMENTS[dept];
  const st = g.departments[dept];
  if (st.abolished) return ['Eliminated by Congress. Its remaining programs are winding down or moved to other agencies.'];
  const directive = findDirective(dept, st.directive);
  const levelNote = LEVEL_WORK[st.level];
  return [...(directive ? [`Priority: ${directive.work}`] : []), ...(levelNote ? [levelNote] : []), ...spec.work];
}

// ---------------------------------------------------------------------------
// Action → BillAnalysis
// ---------------------------------------------------------------------------

const allFlags = (on: Partial<Record<BillFlag, boolean>>) =>
  Object.fromEntries(BILL_FLAGS.map((f) => [f, on[f] ?? false])) as BillAnalysis['flags'];

function reactions(src: Partial<Record<FactionId, number>>, scale: number, reason: string, extra: Partial<Record<FactionId, number>> = {}) {
  return Object.fromEntries(
    FACTION_IDS.map((f) => [f, { delta: clamp(Math.round((src[f] ?? 0) * scale + (extra[f] ?? 0)), -10, 10), reason }]),
  ) as BillAnalysis['faction_modifiers'];
}

function vector(lean: Partial<Record<PolicyAxis, number>>, scale: number, extra: Partial<Record<PolicyAxis, number>> = {}) {
  return Object.fromEntries(
    POLICY_AXES.map((ax) => {
      const v = lean[ax] === undefined && extra[ax] === undefined ? null : (lean[ax] ?? 0) * scale + (extra[ax] ?? 0);
      return [ax, v === null ? null : clamp(Math.round(v), -10, 10)];
    }),
  ) as SparsePolicyVector;
}

type ImpactSpec = Partial<Record<MetricId, ['up' | 'down', 'minor' | 'moderate' | 'major']>>;
const STRONGER = { minor: 'moderate', moderate: 'major', major: 'major' } as const;

function impacts(spec: ImpactSpec, invert = false, stronger = false) {
  return Object.fromEntries(
    METRIC_IDS.map((m) => {
      const i = spec[m];
      if (!i) return [m, { direction: 'none', magnitude: 'none' }];
      const dir = invert ? (i[0] === 'up' ? 'down' : 'up') : i[0];
      return [m, { direction: dir, magnitude: stronger ? STRONGER[i[1]] : i[1] }];
    }),
  ) as BillAnalysis['metric_impacts'];
}

function analysis(fields: Omit<BillAnalysis, 'schema_version' | 'state_overrides' | 'confidence' | 'score_rationale'> & { why: string }): BillAnalysis {
  const { why, ...rest } = fields;
  return {
    schema_version: '1.0',
    ...rest,
    score_rationale: { radical: why, programmatic: 'A concrete budget line or administrative order with a clear mechanism.' },
    state_overrides: [],
    confidence: 1,
  };
}

/** Builds the analysis for a department action. Throws on an unknown directive. */
export function departmentAnalysis(g: GameState, a: DepartmentAction): BillAnalysis {
  const spec = DEPARTMENTS[a.dept];
  const st = g.departments[a.dept];
  const R = DEPARTMENT_RULES;
  const debt: ImpactSpec = { national_debt: ['up', R.debt[spec.size]] };
  const growth: ImpactSpec = { ...spec.growthImpacts, ...debt };
  const area = [spec.short];

  switch (a.type) {
    case 'expand':
    case 'cut': {
      const up = a.type === 'expand';
      const target = st.level + (up ? 1 : -1);
      const pct = Math.round(R.levelStep * 100);
      return analysis({
        title: `${up ? 'Expand' : 'Cut'} the ${spec.short} budget by ${pct}%`,
        summary: `${up ? 'Increases' : 'Reduces'} funding for the ${spec.name} by ${pct}% of its baseline (about $${Math.round(spec.budget * R.levelStep)}B a year).`,
        instrument: 'legislation',
        policy_areas: [...area, 'Budget'],
        radical_score: Math.abs(target) >= 2 ? R.radical.budgetExtreme : R.radical.budget,
        programmatic_score: 8,
        why: 'An ordinary appropriations change.',
        policy_vector: vector(spec.lean, up ? 1 : -1),
        faction_modifiers: reactions(spec.support, up ? R.budgetReaction : -R.budgetReaction, `${up ? 'More' : 'Less'} money for ${spec.short}.`),
        metric_impacts: impacts(growth, !up),
        flags: allFlags({ reconciliation_eligible: true, deficit_financed: up }),
      });
    }
    case 'abolish':
      return analysis({
        title: `Eliminate the ${spec.name}`,
        summary: `Abolishes the ${spec.name} and ends or transfers its programs.`,
        instrument: 'legislation',
        policy_areas: [...area, 'Government reform'],
        radical_score: R.radical.abolish,
        programmatic_score: 6,
        why: 'Eliminating a cabinet department is a structural overhaul of government.',
        policy_vector: vector(spec.lean, -1.5, { institutional: -8 }),
        faction_modifiers: reactions(spec.support, -R.abolishReaction, `Eliminating ${spec.short}.`, { independent: -1 }),
        metric_impacts: impacts(growth, true, true),
        flags: allFlags({ likely_court_challenge: true }),
      });
    case 'restore':
      return analysis({
        title: `Re-establish the ${spec.name}`,
        summary: `Re-creates the ${spec.name} at its baseline budget.`,
        instrument: 'legislation',
        policy_areas: [...area, 'Government reform'],
        radical_score: R.radical.restore,
        programmatic_score: 7,
        why: 'Rebuilding an eliminated department is a major change.',
        policy_vector: vector(spec.lean, 1.5, { institutional: 4 }),
        faction_modifiers: reactions(spec.support, R.restoreReaction, `Bringing back ${spec.short}.`),
        metric_impacts: impacts(growth, false, true),
        flags: allFlags({ deficit_financed: true }),
      });
    case 'directive': {
      const d = findDirective(a.dept, a.directive);
      if (!d) throw new Error(`Unknown directive ${a.directive} for ${a.dept}`);
      return directiveAnalysis(spec, d, 1);
    }
    case 'rescind': {
      const d = findDirective(a.dept, st.directive);
      if (!d) throw new Error(`No directive in force at ${a.dept}`);
      const a2 = directiveAnalysis(spec, d, -0.5);
      return { ...a2, title: `Rescind: ${d.title}`, summary: `Withdraws the order and returns ${spec.short} to its usual work.`, radical_score: R.radical.rescind, flags: allFlags({}) };
    }
  }
}

function directiveAnalysis(spec: DepartmentSpec, d: DirectiveSpec, scale: number): BillAnalysis {
  return analysis({
    title: d.title,
    summary: d.summary,
    instrument: 'executive_order',
    policy_areas: [spec.short],
    radical_score: d.radical,
    programmatic_score: 7,
    why: 'A targeted executive action.',
    policy_vector: vector(d.lean, scale),
    faction_modifiers: reactions(d.reactions, scale, d.title),
    metric_impacts: impacts(d.impacts ?? {}, scale < 0),
    flags: allFlags({ likely_court_challenge: d.courtChallenge ?? false, exceeds_executive_authority: d.exceedsAuthority ?? false }),
  });
}

/** Budget requests use the budget slot; everything else uses its instrument's slot. */
const optsFor = (a: DepartmentAction, opts: SubmitBillOptions): SubmitBillOptions =>
  a.type === 'expand' || a.type === 'cut' ? { ...opts, kind: 'budget' } : opts;

// ---------------------------------------------------------------------------
// Rules and resolution
// ---------------------------------------------------------------------------

export function departmentRejection(g: GameState, a: DepartmentAction, opts: SubmitBillOptions = {}): DepartmentRejection | null {
  const spec = DEPARTMENTS[a.dept];
  const st = g.departments[a.dept];
  switch (a.type) {
    case 'expand':
      if (st.abolished) return 'abolished';
      if (st.level >= 2) return 'at_max_level';
      break;
    case 'cut':
      if (st.abolished) return 'abolished';
      if (st.level <= -2) return 'at_min_level';
      break;
    case 'abolish':
      if (!spec.abolishable) return 'not_abolishable';
      if (st.abolished) return 'abolished';
      break;
    case 'restore':
      if (!st.abolished) return 'not_abolished';
      break;
    case 'directive':
      if (st.abolished) return 'abolished';
      if (!findDirective(a.dept, a.directive)) return 'unknown_directive';
      if (st.directive === a.directive) return 'directive_active';
      break;
    case 'rescind':
      if (!findDirective(a.dept, st.directive)) return 'no_directive';
      break;
  }
  return billRejection(g, departmentAnalysis(g, a), optsFor(a, opts));
}

/** Sends the action through Congress or the courts; on success, updates the department. */
export function performDepartmentAction(g: GameState, a: DepartmentAction, opts: SubmitBillOptions = {}): SubmitBillResult & { bill: BillAnalysis } {
  const why = departmentRejection(g, a, opts);
  if (why) throw new Error(`Department action refused: ${why}`);
  const bill = departmentAnalysis(g, a);
  const result = submitBill(g, bill, optsFor(a, opts));
  const ok = result.outcome.status === 'enacted' || result.outcome.status === 'executive_order_upheld';
  if (!ok) return { ...result, bill };

  const st = g.departments[a.dept];
  const next: DepartmentState = (() => {
    switch (a.type) {
      case 'expand':
        return { ...st, level: (st.level + 1) as DepartmentLevel };
      case 'cut':
        return { ...st, level: (st.level - 1) as DepartmentLevel };
      case 'abolish':
        return { level: 0, abolished: true, directive: null };
      case 'restore':
        return { level: 0, abolished: false, directive: null };
      case 'directive':
        return { ...st, directive: a.directive };
      case 'rescind':
        return { ...st, directive: null };
    }
  })();
  return { ...result, bill, state: { ...result.state, departments: { ...result.state.departments, [a.dept]: next } } };
}
