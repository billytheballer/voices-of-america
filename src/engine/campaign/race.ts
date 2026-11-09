import { FACTION_IDS, POLICY_AXES, STATE_CODES } from '@/domain/constants';
import type { CandidateWing, FactionId, Party, PolicyAxis, PolicyVector } from '@/domain/types';
import { CANDIDATE_POOLS, GENERATED_FIRST, GENERATED_LAST, RACE, REAL_POOL_LAST_CYCLE } from '@/data/candidates';
import { FACTIONS } from '@/data/factions';
import { STATES } from '@/data/states';
import { WINGS } from '@/data/campaign';
import { clamp } from '@/lib/math';
import { createRng, hashString } from '../rng';
import { shockFaction } from '../electorate/applyModifiers';
import type { Candidate, GameState, RaceState } from '../loop/types';

/**
 * The field: who the player runs against. Draws are seeded from the game seed
 * and the cycle (not the main RNG stream), so the same game always faces the
 * same opponents, and adding this system didn't change any existing replay.
 */

const other = (p: Party): Party => (p === 'R' ? 'D' : 'R');
const PARTY_PLURAL: Record<Party, { noun: string; adjective: string }> = {
  R: { noun: 'Republicans', adjective: 'Republican' },
  D: { noun: 'Democrats', adjective: 'Democratic' },
};
const CANDIDATE_WING_LIST: CandidateWing[] = ['base', 'core', 'moderate'];

export const nextPresidentialYear = (year: number) => (year % 4 === 0 ? year : year + (4 - (year % 4)));

/** One candidate for `party` in `cycle`, never one already in `used`. */
export function drawCandidate(seed: number, party: Party, cycle: number, role: 'opponent' | 'rival', used: readonly string[]): Candidate {
  const rng = createRng(hashString(`race:${seed}:${cycle}:${party}:${role}`));
  if (cycle <= REAL_POOL_LAST_CYCLE) {
    const pool = CANDIDATE_POOLS[party].filter((c) => !used.includes(c.id));
    if (pool.length > 0) {
      const c = pool[rng.weightedIndex(pool.map((x) => x.weight))]!;
      return { id: c.id, name: c.name, party, home: c.home, wing: c.wing, real: true, charisma: c.charisma, fundraising: c.fundraising, discipline: c.discipline };
    }
  }
  // Generated: retry until the name is new (there are 900 combinations).
  for (let attempt = 0; ; attempt++) {
    const name = `${GENERATED_FIRST[rng.int(0, GENERATED_FIRST.length - 1)]} ${GENERATED_LAST[rng.int(0, GENERATED_LAST.length - 1)]}`;
    const id = `gen-${name.toLowerCase().replace(/\s+/g, '-')}`;
    if (used.includes(id) && attempt < 50) continue;
    const states = STATE_CODES.filter((s) => s !== 'DC');
    return {
      id,
      name,
      party,
      home: states[rng.int(0, states.length - 1)]!,
      wing: CANDIDATE_WING_LIST[rng.int(0, 2)]!,
      real: false,
      charisma: rng.int(2, 5),
      fundraising: rng.int(2, 5),
      discipline: rng.int(2, 5),
    };
  }
}

/** A fresh field for `cycle`. A rival is drawn only if the player will face a primary. */
export function drawRace(g: Pick<GameState, 'seed' | 'player'>, cycle: number, used: readonly string[]): RaceState {
  const opponent = drawCandidate(g.seed, other(g.player.party), cycle, 'opponent', used);
  const taken = [...used, opponent.id];
  const rival = g.player.isPresident ? null : drawCandidate(g.seed, g.player.party, cycle, 'rival', taken);
  return { cycle, opponent, nominated: false, rival, used: rival ? [...taken, rival.id] : taken };
}

/**
 * Called after the calendar moves: draws the next cycle's field once the last
 * election is over, and a primary rival for a successor who now needs one.
 */
export function ensureRace(g: GameState): GameState {
  const cycle = nextPresidentialYear(g.year);
  if (g.race.cycle !== cycle) return { ...g, race: drawRace(g, cycle, g.race.used) };
  if (g.phase === 'primary' && g.race.rival === null) {
    const rival = drawCandidate(g.seed, g.player.party, cycle, 'rival', g.race.used);
    return { ...g, race: { ...g.race, rival, used: [...g.race.used, rival.id] } };
  }
  return g;
}

/** Ideal point of the opponent's wing of their party. */
const wingIdeal = (c: Candidate): PolicyVector => FACTIONS[WINGS[c.party][c.wing]].idealPoint;
export const opponentFactions = (g: Pick<GameState, 'player'>): FactionId[] =>
  FACTION_IDS.filter((f) => FACTIONS[f].homeParty === other(g.player.party));

/**
 * The convention (start of the general campaign): the opponent's home state
 * rallies to them, and the opposition platform moves toward their wing.
 */
export function nominateOpponent(g: GameState): GameState {
  const opp = g.race.opponent;
  let electorate = g.electorate;
  for (const f of [...opponentFactions(g), 'independent' as const]) {
    electorate = shockFaction(electorate, f, [opp.home], RACE.homeState.satisfaction, f === 'independent' ? 0 : RACE.homeState.turnout);
  }
  const ideal = wingIdeal(opp);
  const oppositionPlatform = Object.fromEntries(
    POLICY_AXES.map((ax) => [ax, g.oppositionPlatform[ax] + RACE.wingPull * (ideal[ax] - g.oppositionPlatform[ax])]),
  ) as PolicyVector;
  const text = `${opp.name} accepts the ${PARTY_PLURAL[opp.party].adjective} nomination. ${STATES[opp.home].name} rallies behind its home-state candidate.`;
  return {
    ...g,
    electorate,
    oppositionPlatform,
    race: { ...g.race, nominated: true },
    campaign: { ...g.campaign, recent: [{ turn: g.turn, text }, ...g.campaign.recent].slice(0, 8) },
  };
}

/** Who your attacks hit: the opponent, or the other party in Congress during a midterm. */
export function attackTarget(g: GameState): string {
  return g.phase === 'midterm_campaign' ? `${PARTY_PLURAL[other(g.player.party)].noun} in Congress` : g.race.opponent.name;
}

/** Multiplier on the player's attacks: disciplined opponents shrug them off; repeated attacks lose force. */
export function attackEffectiveness(g: GameState): number {
  const A = RACE.attack;
  const discipline = g.phase === 'midterm_campaign' ? 3 : g.race.opponent.discipline;
  return (A.effectivenessBase - A.effectivenessPerDiscipline * discipline) / (1 + A.fatigue * g.campaign.negativity);
}

export const backlashChance = (g: GameState, factor = 1) =>
  clamp((RACE.attack.backlashBase + RACE.attack.backlashPer * g.campaign.negativity) * factor, 0, 0.9);

/**
 * The record contrast on one axis: how much farther the opponent is from the
 * independent voter than you are. Positive = a good line of attack.
 */
export function recordContrast(g: GameState, axis: PolicyAxis): number {
  const ind = FACTIONS.independent.idealPoint[axis];
  return Math.abs(g.oppositionPlatform[axis] - ind) - Math.abs(g.playerPlatform[axis] - ind);
}

/** Independent-voter gain from hitting their record on `axis` (before backlash). */
export const recordAttackGain = (g: GameState, axis: PolicyAxis) =>
  clamp(RACE.record.perPoint * (recordContrast(g, axis) + RACE.record.offset), RACE.record.min, RACE.record.max) * attackEffectiveness(g);

/** Opposition ad strength this quarter: their fundraising, halved by your rapid response. */
export function oppositionAdScale(g: GameState): number {
  const fund = g.phase === 'general_campaign' ? g.race.opponent.fundraising : 3.5;
  const rr = g.campaign.rapidResponse ? RACE.rapidResponseFactor : 1;
  return (RACE.oppositionAdScale.base + RACE.oppositionAdScale.per * fund) * rr;
}

/** Your most attackable position: the axis where you sit farthest from the independent voter. */
export function weakestAxis(g: GameState): { axis: PolicyAxis; distance: number } {
  let best: { axis: PolicyAxis; distance: number } = { axis: 'economic', distance: -1 };
  for (const ax of POLICY_AXES) {
    const d = Math.abs(g.playerPlatform[ax] - FACTIONS.independent.idealPoint[ax]);
    if (d > best.distance) best = { axis: ax, distance: d };
  }
  return best;
}

/** The opponent's attack on your weakest position this quarter (general campaign only). Returns 0 if none. */
export function opponentAttackSize(g: GameState): number {
  if (g.phase !== 'general_campaign') return 0;
  const C = RACE.opponentAttack;
  const { distance } = weakestAxis(g);
  if (distance < C.minDistance) return 0;
  const charisma = C.charismaBase + C.charismaPer * g.race.opponent.charisma;
  const rr = g.campaign.rapidResponse ? RACE.rapidResponseFactor : 1;
  return Math.min(C.max, C.perPoint * distance * charisma) * rr;
}
