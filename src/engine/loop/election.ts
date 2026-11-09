import { STATE_CODES } from '@/domain/constants';
import type { Party, StateCode } from '@/domain/types';
import { GAME_LOOP, SEAT_MODEL } from '@/data/balance.config';
import { STATES } from '@/data/states';
import { classUpInYear } from '@/data/senateClasses';
import type { Rng } from '../rng';
import { buildCongressSimInput, buildElectoralUnits, buildSimulationInput } from '../simulation/prepare';
import { resolveElection } from '../simulation/monteCarlo';
import type { CongressState } from '../legislature/types';
import { electionContext } from './forecast';
import type { ElectionRecord, GameState } from './types';

const other = (p: Party): Party => (p === 'R' ? 'D' : 'R');

/**
 * Election night: ONE realization of the same model the forecast uses, drawn
 * from the game's RNG stream. Updates Congress and, in presidential years,
 * the White House.
 */
export function resolveElectionTurn(state: GameState, rng: Rng): { state: GameState; record: ElectionRecord } {
  const ctx = electionContext(state, state.year);
  const kind = ctx.isMidterm ? 'midterm' : 'presidential';
  const input = buildSimulationInput(state.electorate, ctx, state.calibration, {
    seed: 0, // unused by resolveElection: draws come from `rng`
    runs: 1,
    kind,
    congress: buildCongressSimInput(state.congress, state.year, state.player.party),
  });
  const night = resolveElection(input, rng);
  const party = state.player.party;

  // ---- Congress ----
  const house = {} as CongressState['house'];
  STATE_CODES.forEach((s, i) => {
    const mine = night.houseByState[i]!;
    house[s] = { [party]: mine, [other(party)]: STATES[s].houseSeats - mine } as Record<Party, number>;
  });
  const cls = classUpInYear(state.year);
  const raceWinner = new Map<StateCode, Party>();
  input.congress!.senateRaces.forEach((race, k) => raceWinner.set(race.state, night.senateRaceWins[k] ? party : other(party)));
  const senate = state.congress.senate.map((seat) =>
    seat.senateClass === cls && raceWinner.has(seat.state) ? { ...seat, holder: raceWinner.get(seat.state)! } : seat,
  );

  // ---- White House ----
  let won: boolean | undefined;
  if (kind === 'presidential') {
    // 269–269: the House decides (simplified: the party with a House majority).
    won = night.playerEV === 269 ? night.houseSeats >= SEAT_MODEL.houseMajority : night.playerEV >= 270;
  }

  const stateMargins = {} as Record<StateCode, number>;
  STATE_CODES.forEach((s, i) => (stateMargins[s] = night.stateMargins[i]!));
  const unitMargins: Record<string, number> = {};
  buildElectoralUnits(party).forEach((u, k) => (unitMargins[u.id] = night.unitMargins[k]!));
  const senateResults = input.congress!.senateRaces.map((race) => ({
    state: race.state,
    winner: raceWinner.get(race.state)!,
    previousHolder: race.holder,
  }));

  const record: ElectionRecord = {
    year: state.year,
    kind,
    candidate: state.player.name,
    ...(kind === 'presidential' ? { playerEV: night.playerEV, won: won! } : {}),
    popularMargin: night.popularMargin,
    houseSeats: night.houseSeats,
    senateSeats: senate.filter((s) => s.holder === party).length,
    stateMargins,
    unitMargins,
    senateResults,
  };

  let next: GameState = { ...state, congress: { house, senate }, elections: [...state.elections, record] };

  if (kind === 'presidential') {
    if (won) {
      const reelected = state.player.isPresident;
      next = {
        ...next,
        incumbentParty: party,
        politicalCapital: reelected ? state.politicalCapital : GAME_LOOP.inaugurationCapital,
        player: { ...state.player, isPresident: true, termsServed: state.player.termsServed + 1 },
      };
    } else {
      next = {
        ...next,
        incumbentParty: other(party),
        player: { ...state.player, isPresident: false },
        phase: 'game_over',
        gameOver: { reason: 'lost_presidency', year: state.year },
      };
    }
  }
  return { state: next, record };
}
