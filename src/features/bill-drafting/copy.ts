import type { BillFlag } from '@/domain/schemas/billAnalysis.schema';
import type { ImpactDirection, ImpactMagnitude, MetricId } from '@/domain/types';
import type { BillRejection } from '@/engine/loop/types';
import { LLMError, MAX_BILL_CHARS } from '@/services/llm/types';
import { METRIC_META } from '@/lib/format';

/** Every LLM failure becomes a specific, actionable sentence. */
export function analysisErrorText(e: unknown): string {
  if (!(e instanceof LLMError)) return 'The analysis failed unexpectedly. Try again.';
  switch (e.code) {
    case 'too_long':
      return `Bills are limited to ${MAX_BILL_CHARS.toLocaleString('en-US')} characters. Shorten the draft and analyze again.`;
    case 'rate_limited':
      return 'The analyst is handling too many requests. Wait a minute, then analyze again.';
    case 'not_configured':
      return 'The server has no Anthropic API key. Add one, or switch the game to offline mode (VITE_LLM_MODE=mock).';
    case 'model_invalid_output':
      return 'The analyst returned an unusable answer twice. Rephrase the draft more concretely and try again.';
    case 'network_error':
      return `${e.message} Check your connection and analyze again.`;
    case 'forbidden':
      return 'This site is not allowed to use the analysis server.';
    case 'invalid_request':
      return 'The draft could not be sent. Make sure it is not empty.';
    default:
      return 'The analysis server had a problem. Try again in a moment.';
  }
}

export const REJECTION_TEXT: Record<BillRejection, string> = {
  not_president: 'Only a sitting president can send bills to Congress. You can still draft and analyze your platform.',
  wrong_phase: 'Congress is out on election day. Count the votes, then govern.',
  bill_limit_reached: 'You have used this quarter’s legislative slot. End the quarter to introduce another.',
  order_limit_reached: 'You have signed two executive orders this quarter. End the quarter to sign more.',
  budget_limit_reached: 'You have sent Congress one budget request this quarter. End the quarter to send another.',
  insufficient_capital: 'Not enough political capital. It refills each quarter, faster when approval is high.',
  game_over: 'This campaign has ended.',
};

export const OUTCOME_TEXT = {
  enacted: 'Signed into law',
  failed_house: 'Failed in the House',
  failed_senate: 'Failed in the Senate',
  executive_order_upheld: 'Order signed and upheld',
  executive_order_struck_down: 'Order struck down in court',
} as const;

export const FLAG_TEXT: Record<BillFlag, string> = {
  likely_court_challenge: 'Expect a court challenge.',
  exceeds_executive_authority: 'Claims powers usually reserved to Congress; courts may strike it down.',
  foreign_aid_blank_check: 'Open-ended foreign aid: America First voters punish this.',
  domestic_roi_tangible: 'Ties foreign action to a domestic return: America First voters reward this.',
  deficit_financed: 'Adds to the deficit with no offset.',
  reconciliation_eligible: 'Budget-only: can pass the Senate with 51 votes through reconciliation.',
};

const MAGNITUDE_WORD: Record<Exclude<ImpactMagnitude, 'none'>, string> = { minor: 'slightly', moderate: 'noticeably', major: 'sharply' };

/** "Pushes core inflation noticeably up", or null for no effect. */
export function impactSentence(m: MetricId, d: ImpactDirection, mag: ImpactMagnitude): string | null {
  if (d === 'none' || mag === 'none') return null;
  return `${METRIC_META[m].label}: ${d === 'up' ? 'rises' : 'falls'} ${MAGNITUDE_WORD[mag]}`;
}

/** Starter drafts. Plain text, so they go through the same analysis as anything the player writes. */
export const EXAMPLE_DRAFTS: { label: string; text: string }[] = [
  {
    label: 'Border and farm labor',
    text: 'Hire 3,000 new border processing officers and fund new detection technology at ports of entry, paired with a seasonal visa for vetted farmworkers. Funded by customs fees and phased in over two years, administered by the Department of Homeland Security.',
  },
  {
    label: 'Child tax credit',
    text: 'Expand the child tax credit to $3,000 per child, phasing out above $150,000 in household income, starting next tax year.',
  },
  {
    label: 'Supply-chain alliance',
    text: 'Provide security assistance to allied nations in exchange for guaranteed critical minerals and chip supply agreements with US manufacturers, with annual audits by the Commerce Department.',
  },
  {
    label: 'Gas tax holiday (order)',
    text: 'By executive order, suspend collection of the federal gas tax for 90 days to bring down prices at the pump.',
  },
  {
    label: 'Clean government',
    text: 'Ban members of Congress from trading individual stocks and impose a five-year lobbying ban on former members, enforced by an independent ethics office.',
  },
];
