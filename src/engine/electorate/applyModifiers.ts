import { FACTION_IDS, POLICY_AXES, STATE_CODES } from '@/domain/constants';
import type { FactionId, StateCode, StateTag } from '@/domain/types';
import type { BillAnalysis } from '@/domain/schemas/billAnalysis.schema';
import { STATES } from '@/data/states';
import {
  FACTION_RULES,
  SATISFACTION,
  type FactionRule,
  type RuleCondition,
} from '@/data/balance.config';
import { clamp } from '@/lib/math';
import type { AppliedEffect, ElectorateMap } from '../types';

/** The subset of a BillAnalysis the rule engine reads. */
export type RuleInput = Pick<BillAnalysis, 'policy_vector' | 'flags'>;

export function evaluateCondition(c: RuleCondition, bill: RuleInput): boolean {
  switch (c.kind) {
    case 'flag':
      return (bill.flags[c.flag] ?? false) === c.equals;
    case 'axis': {
      const v = bill.policy_vector[c.axis];
      if (v === null || v === undefined) return false;
      return c.op === 'lte' ? v <= c.value : v >= c.value;
    }
    case 'anyAxisAbsGte':
      return POLICY_AXES.some((a) => {
        const v = bill.policy_vector[a];
        return v !== null && v !== undefined && Math.abs(v) >= c.value;
      });
    case 'all':
      return c.of.every((x) => evaluateCondition(x, bill));
    case 'any':
      return c.of.some((x) => evaluateCondition(x, bill));
  }
}

const statesWithTag = (tag: StateTag): StateCode[] => STATE_CODES.filter((s) => STATES[s].tags.includes(tag));

/** Immutable helper: returns a new map with one faction changed in the given states. */
function adjust(
  map: ElectorateMap,
  faction: FactionId,
  states: readonly StateCode[],
  satisfactionDelta: number,
  turnoutDelta = 0,
): ElectorateMap {
  const next = { ...map };
  for (const s of states) {
    const e = next[s][faction];
    next[s] = {
      ...next[s],
      [faction]: {
        ...e,
        satisfaction: clamp(e.satisfaction + satisfactionDelta, 0, 100),
        turnoutShift: clamp(e.turnoutShift + turnoutDelta, -0.2, 0.2),
      },
    };
  }
  return next;
}

export interface ApplyResult {
  electorate: ElectorateMap;
  effects: AppliedEffect[];
}

/**
 * Applies an ENACTED bill to the electorate, in a fixed, auditable order:
 *   1. LLM faction modifiers (nationwide)
 *   2. LLM state overrides
 *   3. Deterministic faction rules from balance.config
 * Returns the new electorate and an audit trail for the UI.
 */
export function applyBill(
  electorate: ElectorateMap,
  bill: BillAnalysis,
  rules: readonly FactionRule[] = FACTION_RULES,
  cfg = SATISFACTION,
): ApplyResult {
  let map = electorate;
  const effects: AppliedEffect[] = [];

  for (const f of FACTION_IDS) {
    const delta = bill.faction_modifiers[f].delta * cfg.modifierScale;
    if (delta === 0) continue;
    map = adjust(map, f, STATE_CODES, delta);
    effects.push({ source: 'llm_modifier', sourceId: bill.title, faction: f, satisfactionDelta: delta });
  }

  for (const o of bill.state_overrides) {
    const delta = o.delta * cfg.modifierScale;
    map = adjust(map, o.faction, [o.state], delta);
    effects.push({ source: 'state_override', sourceId: o.reason, faction: o.faction, states: [o.state], satisfactionDelta: delta });
  }

  for (const rule of rules) {
    if (!evaluateCondition(rule.when, bill)) continue;
    for (const eff of rule.effects) {
      const states = eff.stateTag ? statesWithTag(eff.stateTag) : STATE_CODES;
      map = adjust(map, eff.faction, states, eff.satisfactionDelta, eff.turnoutDelta ?? 0);
      effects.push({
        source: 'rule',
        sourceId: rule.id,
        faction: eff.faction,
        ...(eff.stateTag ? { states } : {}),
        satisfactionDelta: eff.satisfactionDelta,
        ...(eff.turnoutDelta !== undefined ? { turnoutDelta: eff.turnoutDelta } : {}),
      });
    }
  }

  return { electorate: map, effects };
}

/** Generic satisfaction shock (events, metric pressure) for one faction in a set of states. */
export function shockFaction(
  electorate: ElectorateMap,
  faction: FactionId,
  states: readonly StateCode[],
  satisfactionDelta: number,
  turnoutDelta = 0,
): ElectorateMap {
  return adjust(electorate, faction, states, satisfactionDelta, turnoutDelta);
}

/** End-of-turn memory fade: satisfaction drifts back toward 50, rule turnout boosts fade. */
export function decayElectorate(electorate: ElectorateMap, cfg = SATISFACTION): ElectorateMap {
  const next = {} as ElectorateMap;
  for (const s of STATE_CODES) {
    const state = { ...electorate[s] };
    for (const f of FACTION_IDS) {
      const e = state[f];
      state[f] = {
        ...e,
        satisfaction: e.satisfaction + (50 - e.satisfaction) * cfg.decayPerTurn,
        turnoutShift: e.turnoutShift * (1 - cfg.turnoutShiftDecayPerTurn),
      };
    }
    next[s] = state;
  }
  return next;
}
