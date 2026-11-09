import { STATE_CODES } from '@/domain/constants';
import type { NationalMetrics, StateCode } from '@/domain/types';
import { EVENTS, type GameEvent } from '@/data/events';
import { STATES } from '@/data/states';
import type { Rng } from '../rng';
import type { AppliedEffect, ElectorateMap } from '../types';
import { shockFaction } from '../electorate/applyModifiers';
import { applyShocks } from '../economy/metrics';

/** Current draw weight: base weight × every condition multiplier that holds. 0 if on cooldown. */
export function eventWeight(
  e: GameEvent,
  metrics: NationalMetrics,
  turnsSinceFired: number | undefined,
): number {
  if (turnsSinceFired !== undefined && turnsSinceFired < e.cooldownTurns) return 0;
  let w = e.baseWeight;
  for (const c of e.conditions ?? []) {
    const holds = c.op === 'gte' ? metrics[c.metric] >= c.value : metrics[c.metric] <= c.value;
    if (holds) w *= c.weightMultiplier;
  }
  return w;
}

/**
 * Draws this turn's event. `history` maps event id → turns since it last fired.
 * Deterministic given the RNG state.
 */
export function drawEvent(
  rng: Rng,
  metrics: NationalMetrics,
  history: Readonly<Record<string, number>>,
  deck: readonly GameEvent[] = EVENTS,
): GameEvent {
  const weights = deck.map((e) => eventWeight(e, metrics, history[e.id]));
  if (weights.every((w) => w === 0)) return deck[0]!; // whole deck on cooldown: fall back
  return deck[rng.weightedIndex(weights)]!;
}

function targetStates(shock: NonNullable<GameEvent['factionShocks']>[number]): StateCode[] {
  return STATE_CODES.filter((s) => {
    const p = STATES[s];
    if (shock.regions && !shock.regions.includes(p.region)) return false;
    if (shock.stateTag && !p.tags.includes(shock.stateTag)) return false;
    return true;
  });
}

/**
 * Applies an event's metric and faction shocks. Faction shocks are satisfaction
 * with the GOVERNMENT, so `blame` scales them: 1 when the player holds the
 * White House; negative (the player gains what the incumbent loses) when not.
 */
export function applyEvent(
  event: GameEvent,
  metrics: NationalMetrics,
  electorate: ElectorateMap,
  blame = 1,
): { metrics: NationalMetrics; electorate: ElectorateMap; effects: AppliedEffect[] } {
  let map = electorate;
  const effects: AppliedEffect[] = [];
  for (const shock of event.factionShocks ?? []) {
    const states = targetStates(shock);
    const delta = shock.delta * blame;
    map = shockFaction(map, shock.faction, states, delta);
    effects.push({ source: 'event', sourceId: event.id, faction: shock.faction, states, satisfactionDelta: delta });
  }
  return { metrics: applyShocks(metrics, event.metricShocks), electorate: map, effects };
}

/** Advance cooldown counters by one turn and record the event that just fired. */
export function advanceEventHistory(history: Readonly<Record<string, number>>, firedId: string): Record<string, number> {
  const next: Record<string, number> = {};
  for (const [id, n] of Object.entries(history)) next[id] = n + 1;
  next[firedId] = 0;
  return next;
}
