import type { GamePhase } from '@/domain/types';

/**
 * The calendar is a pure function of (year, quarter, is the player the sitting
 * president?). One turn = one quarter.
 *
 *   Presidential year (2028, 2032…)  Q1–Q2 primary (or governing for a sitting president)
 *                                    Q3 general_campaign · Q4 general_election
 *   Midterm year (2030, 2034…)       Q1–Q2 governing · Q3 midterm_campaign · Q4 midterm_election
 *   Odd years                        governing
 *
 * Elections resolve when the player ENDS the Q4 turn, after seeing the final forecast.
 * Inauguration happens on the next turn (Q1), so 'transition' is not a playable turn.
 */
export const isPresidentialYear = (year: number) => year % 4 === 0;
export const isMidtermYear = (year: number) => year % 4 === 2;

export function phaseFor(year: number, quarter: 1 | 2 | 3 | 4, playerIsPresident: boolean): GamePhase {
  if (isPresidentialYear(year)) {
    if (quarter <= 2) return playerIsPresident ? 'governing' : 'primary';
    return quarter === 3 ? 'general_campaign' : 'general_election';
  }
  if (isMidtermYear(year)) {
    if (quarter <= 2) return 'governing';
    return quarter === 3 ? 'midterm_campaign' : 'midterm_election';
  }
  return 'governing';
}

export function nextQuarter(year: number, quarter: 1 | 2 | 3 | 4): { year: number; quarter: 1 | 2 | 3 | 4 } {
  return quarter === 4 ? { year: year + 1, quarter: 1 } : { year, quarter: (quarter + 1) as 2 | 3 | 4 };
}

/** Turns from now until the next election turn (Q4 of an even year). 0 = this is election day. */
export function turnsUntilElection(year: number, quarter: 1 | 2 | 3 | 4): number {
  const targetYear = year % 2 === 0 ? year : year + 1;
  return (targetYear - year) * 4 + (4 - quarter);
}

export const isElectionPhase = (p: GamePhase) => p === 'general_election' || p === 'midterm_election';

/** A sitting president can legislate in any phase except the election turn itself. */
export const canLegislateIn = (p: GamePhase) => p !== 'general_election' && p !== 'midterm_election' && p !== 'game_over';

export const turnId = (year: number, quarter: number) => `${year}-Q${quarter}`;

/** Turn id in the feed contract's format, e.g. "2029-T03" for Q3 2029. */
export const feedTurnId = (year: number, quarter: number) => `${year}-T0${quarter}`;
