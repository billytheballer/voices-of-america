import { useEffect, useRef } from 'react';
import { COALITION_IDS, COALITION_LABELS, COALITION_MEMBERS } from '@/domain/constants';
import type { StateCode } from '@/domain/types';
import { FACTIONS } from '@/data/factions';
import { STATES } from '@/data/states';
import { classUpInYear } from '@/data/senateClasses';
import type { GameState } from '@/engine/loop/types';
import type { Forecast } from '@/hooks/useForecast';
import { selectStateDetail } from '@/store/selectors';
import { PARTY_ADJ, pct, signed } from '@/lib/format';

/** Side sheet for one state: forecast, today's margin, Senate race, and the full 8-faction split. */
export function StateDrawer({
  game,
  state,
  forecast,
  onClose,
}: {
  game: GameState;
  state: StateCode;
  forecast: Forecast;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  const p = STATES[state];
  const detail = selectStateDetail(game, state);
  const fc = forecast.result?.states[state];
  const senate = forecast.result?.congress?.senateRaces[state];
  const last = game.elections.at(-1);
  const house = game.congress.house[state];
  const me = game.player.party;
  const senators = game.congress.senate.filter((x) => x.state === state);
  const upYear = forecast.year;
  const upClass = classUpInYear(upYear);

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby="drawer-h"
      className="ml-auto h-full max-h-none w-[min(30rem,100vw)] border-l border-rule bg-panel p-0 text-ink backdrop:bg-ink/40"
    >
      <div className="flex h-full flex-col">
        <div className="flex items-start justify-between border-b border-rule px-6 py-5">
          <div>
            <h2 id="drawer-h" className="font-serif text-3xl font-black">{p.name}</h2>
            <p className="mt-1 text-sm text-ink-2">
              {p.electoralVotes} electoral votes, {p.houseSeats} House {p.houseSeats === 1 ? 'seat' : 'seats'}
              {p.districts && ', electoral votes split by district'}
            </p>
          </div>
          <button type="button" onClick={() => ref.current?.close()} className="rounded p-1 text-ink-2 hover:text-ink" aria-label="Close">
            ✕
          </button>
        </div>

        <div className="flex-1 space-y-7 overflow-y-auto px-6 py-6">
          <dl className="grid grid-cols-2 gap-5">
            <div>
              <dt className="text-sm text-ink-2">Chance you carry it in {upYear}</dt>
              <dd className="text-3xl font-semibold tabular-nums">{fc ? pct(fc.winProbability) : '…'}</dd>
              {fc && <dd className="text-xs text-ink-3">90% of simulations: {signed(fc.p5Margin)} to {signed(fc.p95Margin)} pts</dd>}
            </div>
            <div>
              <dt className="text-sm text-ink-2">If the vote were today</dt>
              <dd className="text-3xl font-semibold tabular-nums">{signed(detail.margin)}</dd>
              <dd className="text-xs text-ink-3">your margin in points; turnout {pct(detail.turnout)}</dd>
            </div>
            {last && (
              <div>
                <dt className="text-sm text-ink-2">{last.year} result</dt>
                <dd className="text-xl font-semibold tabular-nums">{signed(last.stateMargins[state])}</dd>
              </div>
            )}
            <div>
              <dt className="text-sm text-ink-2">House delegation</dt>
              <dd className="text-xl font-semibold tabular-nums">
                {house[me]} <span className="text-sm font-normal text-ink-2">yours of</span> {p.houseSeats}
              </dd>
            </div>
          </dl>

          {senators.length > 0 && (
            <div>
              <h3 className="font-semibold">Senate</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {senators.map((x) => (
                  <li key={x.senateClass} className="flex justify-between">
                    <span>
                      Class {x.senateClass} seat, held by {x.holder === me ? 'your party' : `the ${PARTY_ADJ[x.holder]}s`}
                    </span>
                    <span className="text-ink-2">
                      {x.senateClass === upClass && senate ? `Up in ${upYear}: ${pct(senate.winProbability)} you win it` : 'Not up this cycle'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <h3 className="font-semibold">The eight factions here</h3>
            <p className="mt-1 text-sm text-ink-2">Share of the electorate, satisfaction with your party (50 is neutral), expected turnout, and the share of their votes you win.</p>
            <table className="mt-3 w-full text-sm">
              <thead className="text-left text-xs text-ink-2">
                <tr>
                  <th className="pb-1 font-medium">Faction</th>
                  <th className="pb-1 text-right font-medium">Share</th>
                  <th className="pb-1 text-right font-medium">Mood</th>
                  <th className="pb-1 text-right font-medium">Turnout</th>
                  <th className="pb-1 text-right font-medium">Your vote</th>
                </tr>
              </thead>
              {COALITION_IDS.map((c) => (
                <tbody key={c}>
                  <tr>
                    <th colSpan={5} className="pt-3 pb-1 text-left text-xs font-semibold text-ink-2">
                      {COALITION_LABELS[c]}
                    </th>
                  </tr>
                  {COALITION_MEMBERS[c].map((f) => {
                    const row = detail.factions.find((r) => r.faction === f)!;
                    return (
                      <tr key={f} className="border-t border-rule tabular-nums">
                        <td className="py-1.5">{FACTIONS[f].label}</td>
                        <td className="py-1.5 text-right">{pct(row.share)}</td>
                        <td className="py-1.5 text-right">{Math.round(row.satisfaction)}</td>
                        <td className="py-1.5 text-right">{pct(row.turnout)}</td>
                        <td className="py-1.5 text-right font-semibold">{pct(row.playerVoteShare)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              ))}
            </table>
          </div>

          {p.districts && forecast.result && (
            <div>
              <h3 className="font-semibold">By district</h3>
              <ul className="mt-2 space-y-1 text-sm">
                {Object.entries(forecast.result.districts)
                  .filter(([id]) => id.startsWith(state))
                  .map(([id, d]) => (
                    <li key={id} className="flex justify-between">
                      <span>{id.endsWith('-AL') ? 'Statewide (2 electoral votes)' : `District ${id.split('-')[1]} (1 electoral vote)`}</span>
                      <span className="tabular-nums">{pct(d.winProbability)} yours</span>
                    </li>
                  ))}
              </ul>
            </div>
          )}
        </div>
      </div>
    </dialog>
  );
}
