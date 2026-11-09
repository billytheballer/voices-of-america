import { FACTION_IDS } from '@/domain/constants';
import type { Party } from '@/domain/types';
import type { BillAnalysis } from '@/domain/schemas/billAnalysis.schema';
import { FACTIONS } from '@/data/factions';
import { LEGISLATURE } from '@/data/balance.config';
import { clamp } from '@/lib/math';
import type { Rng } from '../rng';
import type { ChamberCounts } from './types';

/**
 * Roll-call model. Every member of a party votes yes independently with the
 * same probability, so a chamber's yes-count is the sum of two binomials.
 * Pass probability is computed EXACTLY by convolving them; no sampling, so
 * the UI's "62% to pass" is deterministic and testable.
 */

type BillForVote = Pick<BillAnalysis, 'radical_score' | 'programmatic_score' | 'faction_modifiers'>;

/** Weighted mean LLM modifier (−10..+10) across a party's home factions. */
export function coalitionMood(bill: BillForVote, party: Party): number {
  let num = 0;
  let den = 0;
  for (const f of FACTION_IDS) {
    if (FACTIONS[f].homeParty !== party) continue;
    num += FACTIONS[f].nationalWeight * bill.faction_modifiers[f].delta;
    den += FACTIONS[f].nationalWeight;
  }
  return den === 0 ? 0 : num / den;
}

/** Programmatic 5+ → 1.0×; each point below → −6%. */
export const programmaticFactor = (score: number, cfg = LEGISLATURE) =>
  1 - cfg.programmaticPenalty.perPointBelow * Math.max(0, cfg.programmaticPenalty.threshold - score);

export interface MemberProbabilities {
  player: number;
  opposition: number;
}

export function memberYesProbabilities(
  bill: BillForVote,
  playerParty: Party,
  whipCapital = 0,
  cfg = LEGISLATURE,
): MemberProbabilities {
  const v = cfg.vote;
  const opp: Party = playerParty === 'R' ? 'D' : 'R';
  const whip = (Math.min(whipCapital, v.whipMaxCapital) / 10) * v.whipPer10Capital;
  const prog = programmaticFactor(bill.programmatic_score, cfg);

  const own =
    v.partyLoyalty -
    v.radicalDefectionPerPoint * Math.max(0, bill.radical_score - v.radicalComfort) +
    v.coalitionMoodWeight * coalitionMood(bill, playerParty) +
    whip;

  const cross =
    v.oppositionCrossover +
    v.bipartisanBonusPerPoint * Math.max(0, v.bipartisanCeiling - bill.radical_score) +
    v.coalitionMoodWeight * coalitionMood(bill, opp) +
    whip / 2;

  return {
    player: clamp(own * prog, 0.02, 0.995),
    opposition: clamp(cross * prog, 0.001, 0.9),
  };
}

/** Binomial PMF as an array of length n+1, computed in log-space for stability. */
export function binomialPmf(n: number, p: number): Float64Array {
  const out = new Float64Array(n + 1);
  if (p <= 0) {
    out[0] = 1;
    return out;
  }
  if (p >= 1) {
    out[n] = 1;
    return out;
  }
  const lp = Math.log(p);
  const lq = Math.log(1 - p);
  let logC = 0; // log C(n, 0)
  for (let k = 0; k <= n; k++) {
    out[k] = Math.exp(logC + k * lp + (n - k) * lq);
    logC += Math.log(n - k) - Math.log(k + 1);
  }
  return out;
}

/** P(yes ≥ threshold) for a chamber. */
export function passProbability(counts: ChamberCounts, probs: MemberProbabilities, threshold: number): number {
  const a = binomialPmf(counts.player, probs.player);
  const b = binomialPmf(counts.opposition, probs.opposition);
  let pass = 0;
  for (let i = 0; i < a.length; i++) {
    if (a[i]! < 1e-15) continue;
    for (let j = Math.max(0, threshold - i); j < b.length; j++) pass += a[i]! * b[j]!;
  }
  return clamp(pass, 0, 1);
}

export interface PassageForecast {
  probabilities: MemberProbabilities;
  house: number;
  senate: number;
  /** Both chambers (independent given member probabilities). */
  overall: number;
}

export interface VoteOptions {
  /** Extra capital spent whipping votes. */
  whipCapital?: number;
  /** Use budget reconciliation (51 votes) if the bill is eligible. */
  reconciliation?: boolean;
  /** Does the player's party hold the VP tie-breaker? */
  playerHoldsVP?: boolean;
}

/** Senate votes needed. Reconciliation needs 51, or 50 with the VP; otherwise 60. */
export function senateThreshold(
  bill: Pick<BillAnalysis, 'flags'>,
  { reconciliation = false, playerHoldsVP = true }: VoteOptions,
  cfg = LEGISLATURE,
): number {
  if (reconciliation && bill.flags.reconciliation_eligible) {
    return playerHoldsVP ? cfg.thresholds.senateReconciliation - 1 : cfg.thresholds.senateReconciliation;
  }
  return cfg.thresholds.senate;
}

export function forecastPassage(
  bill: BillForVote & Pick<BillAnalysis, 'flags'>,
  playerParty: Party,
  house: ChamberCounts,
  senate: ChamberCounts,
  opts: VoteOptions = {},
  cfg = LEGISLATURE,
): PassageForecast {
  const probabilities = memberYesProbabilities(bill, playerParty, opts.whipCapital ?? 0, cfg);
  const h = passProbability(house, probabilities, cfg.thresholds.house);
  const s = passProbability(senate, probabilities, senateThreshold(bill, opts, cfg));
  return { probabilities, house: h, senate: s, overall: h * s };
}

export interface RollCall {
  yes: number;
  no: number;
  playerPartyYes: number;
  oppositionYes: number;
  passed: boolean;
}

function sampleBinomial(rng: Rng, n: number, p: number): number {
  let k = 0;
  for (let i = 0; i < n; i++) if (rng.next() < p) k++;
  return k;
}

/** Draws the actual vote for the UI tally ("House 221–214"). */
export function rollCall(rng: Rng, counts: ChamberCounts, probs: MemberProbabilities, threshold: number): RollCall {
  const playerPartyYes = sampleBinomial(rng, counts.player, probs.player);
  const oppositionYes = sampleBinomial(rng, counts.opposition, probs.opposition);
  const yes = playerPartyYes + oppositionYes;
  return { yes, no: counts.player + counts.opposition - yes, playerPartyYes, oppositionYes, passed: yes >= threshold };
}

export type BillOutcome =
  | { status: 'enacted'; house: RollCall; senate: RollCall }
  | { status: 'failed_house'; house: RollCall }
  | { status: 'failed_senate'; house: RollCall; senate: RollCall }
  | { status: 'executive_order_upheld' }
  | { status: 'executive_order_struck_down' };

/** P(an executive order survives the courts), from the LLM's legal-risk flags. */
export function executiveOrderSurvival(bill: Pick<BillAnalysis, 'flags'>, cfg = LEGISLATURE): number {
  let risk = 0;
  if (bill.flags.likely_court_challenge) risk += cfg.courtStrikeRisk.likely_court_challenge;
  if (bill.flags.exceeds_executive_authority) risk += cfg.courtStrikeRisk.exceeds_executive_authority;
  return clamp(1 - risk, 0.05, 1);
}

/** Resolves a bill or executive order end-to-end with the seeded RNG. */
export function resolveBill(
  rng: Rng,
  bill: BillForVote & Pick<BillAnalysis, 'instrument' | 'flags'>,
  playerParty: Party,
  house: ChamberCounts,
  senate: ChamberCounts,
  opts: VoteOptions = {},
  cfg = LEGISLATURE,
): BillOutcome {
  if (bill.instrument === 'executive_order') {
    return rng.next() < executiveOrderSurvival(bill, cfg)
      ? { status: 'executive_order_upheld' }
      : { status: 'executive_order_struck_down' };
  }
  const probs = memberYesProbabilities(bill, playerParty, opts.whipCapital ?? 0, cfg);
  const h = rollCall(rng, house, probs, cfg.thresholds.house);
  if (!h.passed) return { status: 'failed_house', house: h };
  const s = rollCall(rng, senate, probs, senateThreshold(bill, opts, cfg));
  return s.passed ? { status: 'enacted', house: h, senate: s } : { status: 'failed_senate', house: h, senate: s };
}
