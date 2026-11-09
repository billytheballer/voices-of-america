import type { BillAnalysis } from '../../domain/schemas/billAnalysis.schema';
import type { ArchetypeMoodInput, FeedBatch } from '../../domain/schemas/feedBatch.schema';
import type { MetricId, NationalMetrics, Party } from '../../domain/types';

/** Context the bill parser gets alongside the player's text. Small on purpose. */
export interface BillContext {
  year: number;
  quarter: number;
  playerParty: Party;
  metrics: NationalMetrics;
  currentEvent: string;
}

export interface ParseBillRequest {
  text: string;
  context: BillContext;
}

export interface FeedRequest {
  turnId: string;
  /** One per archetype, computed by the engine (engine/sentiment/archetypeMood.ts). */
  moods: ArchetypeMoodInput[];
  context: {
    playerName: string;
    playerParty: Party;
    isPresident: boolean;
    year: number;
    quarter: number;
    eventHeadline: string;
    billTitle: string | null;
    worstMetric: MetricId | null;
  };
}

export interface LLMProvider {
  readonly name: 'mock' | 'proxy';
  parseBill(req: ParseBillRequest, signal?: AbortSignal): Promise<BillAnalysis>;
  generateFeed(req: FeedRequest, signal?: AbortSignal): Promise<FeedBatch>;
}

export type LLMErrorCode =
  | 'invalid_request'
  | 'too_long'
  | 'rate_limited'
  | 'model_invalid_output'
  | 'upstream_error'
  | 'network_error'
  | 'not_configured'
  | 'forbidden';

/** Errors carry a code the UI can turn into a specific, actionable message. */
export class LLMError extends Error {
  constructor(
    readonly code: LLMErrorCode,
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'LLMError';
  }
}

export const MAX_BILL_CHARS = 2_000;
