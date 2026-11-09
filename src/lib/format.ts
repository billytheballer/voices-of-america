import type { GamePhase, MetricId, Party } from '@/domain/types';

export const pct = (x: number, digits = 0) => `${(x * 100).toFixed(digits)}%`;

/** Signed margin in points from the player's perspective, e.g. "+3.2" / "−1.0". */
export const signed = (x: number, digits = 1) => `${x >= 0 ? '+' : '−'}${Math.abs(x).toFixed(digits)}`;

export const PARTY_NAME: Record<Party, string> = { R: 'Republican', D: 'Democrat' };
export const PARTY_ADJ: Record<Party, string> = { R: 'Republican', D: 'Democratic' };
export const PARTY_COLOR_VAR: Record<Party, string> = { R: 'var(--color-gop)', D: 'var(--color-dem)' };

export const PHASE_LABEL: Record<GamePhase, string> = {
  setup: 'Setup',
  primary: 'Primary season',
  general_campaign: 'General election campaign',
  general_election: 'Election day',
  transition: 'Transition',
  governing: 'Governing',
  midterm_campaign: 'Midterm campaign',
  midterm_election: 'Midterm election day',
  game_over: 'Game over',
};

interface MetricMeta {
  label: string;
  format: (v: number) => string;
  /** Is a rising value bad for the country (as voters see it)? */
  higherIsWorse: boolean;
}

export const METRIC_META: Record<MetricId, MetricMeta> = {
  gas_price: { label: 'Average gas price', format: (v) => `$${v.toFixed(2)}`, higherIsWorse: true },
  inflation: { label: 'Core inflation', format: (v) => `${v.toFixed(1)}%`, higherIsWorse: true },
  national_debt: { label: 'National debt', format: (v) => `$${v.toFixed(1)}T`, higherIsWorse: true },
  border_crossings: {
    label: 'Border crossings',
    format: (v) => `${Math.round(v / 100) / 10}k/mo`,
    higherIsWorse: true,
  },
  conflict_index: { label: 'Global conflict index', format: (v) => `${Math.round(v)}/100`, higherIsWorse: true },
};

export const quarterLabel = (year: number, quarter: number) => `Q${quarter} ${year}`;
