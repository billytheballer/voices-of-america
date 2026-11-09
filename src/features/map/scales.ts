import type { Party } from '@/domain/types';

/**
 * Diverging scales for the map. Each arm is one hue, light → dark, checked
 * with the dataviz validator (monotone lightness, visible step gaps, light end
 * ≥ 2:1 against the page). The midpoint is a neutral gray, never a hue.
 * Tiles also carry a hairline outline, so the gray midpoint reads on the page.
 */
export const RAMPS = {
  // Light and middle steps carry navy text at ≥ 4.6:1; dark steps carry white at ≥ 5:1 (WCAG AA).
  D: ['#94AED4', '#698CC2', '#2559A7'],
  R: ['#DD9D99', '#CD706B', '#B8322B'],
  unhappy: ['#C5A3B8', '#AD7B99', '#8E4A73'],
  happy: ['#82B5BF', '#4C95A3', '#1F7A8C'],
  mid: '#D5D9E0',
} as const;

export interface Bin {
  label: string;
  color: string;
  /** Dark fills get white text. */
  inkOnFill: 'light' | 'dark';
}

const opp = (p: Party): Party => (p === 'R' ? 'D' : 'R');

function sevenBins(pos: readonly string[], neg: readonly string[], labels: [string, string, string, string, string, string, string]): Bin[] {
  return [
    { label: labels[0], color: neg[2]!, inkOnFill: 'light' },
    { label: labels[1], color: neg[1]!, inkOnFill: 'dark' },
    { label: labels[2], color: neg[0]!, inkOnFill: 'dark' },
    { label: labels[3], color: RAMPS.mid, inkOnFill: 'dark' },
    { label: labels[4], color: pos[0]!, inkOnFill: 'dark' },
    { label: labels[5], color: pos[1]!, inkOnFill: 'dark' },
    { label: labels[6], color: pos[2]!, inkOnFill: 'light' },
  ];
}

/** Forecast: bins by the player's win probability. */
export function probabilityBins(player: Party): Bin[] {
  return sevenBins(RAMPS[player], RAMPS[opp(player)], [
    'Safe opposition',
    'Likely opposition',
    'Leans opposition',
    'Toss-up',
    'Leans yours',
    'Likely yours',
    'Safe yours',
  ]);
}

export function probabilityBin(p: number): number {
  if (p < 0.05) return 0;
  if (p < 0.25) return 1;
  if (p < 0.4) return 2;
  if (p <= 0.6) return 3;
  if (p <= 0.75) return 4;
  if (p <= 0.95) return 5;
  return 6;
}

/**
 * Results: bins by the player's margin in points. No neutral midpoint: after an
 * election every state has a winner, so even a 0.3-point state takes a side
 * (the lightest step). The forecast keeps its gray toss-up.
 */
export function marginBins(player: Party): Bin[] {
  const pos = RAMPS[player];
  const neg = RAMPS[opp(player)];
  return [
    { label: 'Lost by 15+', color: neg[2], inkOnFill: 'light' },
    { label: 'Lost by 5–15', color: neg[1], inkOnFill: 'dark' },
    { label: 'Lost by under 5', color: neg[0], inkOnFill: 'dark' },
    { label: 'Won by under 5', color: pos[0], inkOnFill: 'dark' },
    { label: 'Won by 5–15', color: pos[1], inkOnFill: 'dark' },
    { label: 'Won by 15+', color: pos[2], inkOnFill: 'light' },
  ];
}

export function marginBin(m: number): number {
  if (m <= -15) return 0;
  if (m <= -5) return 1;
  if (m <= 0) return 2;
  if (m < 5) return 3;
  if (m < 15) return 4;
  return 5;
}

/** Faction lens: bins by satisfaction with the player's party (50 = neutral). */
export const satisfactionBins: Bin[] = sevenBins(RAMPS.happy, RAMPS.unhappy, [
  'Furious (under 30)',
  'Unhappy (30–40)',
  'Cool (40–47)',
  'Neutral (47–53)',
  'Warm (53–60)',
  'Happy (60–70)',
  'Devoted (70+)',
]);

export function satisfactionBin(s: number): number {
  if (s < 30) return 0;
  if (s < 40) return 1;
  if (s < 47) return 2;
  if (s <= 53) return 3;
  if (s <= 60) return 4;
  if (s <= 70) return 5;
  return 6;
}
