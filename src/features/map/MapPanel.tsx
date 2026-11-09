import { useMemo, useState } from 'react';
import { FACTION_IDS, STATE_CODES } from '@/domain/constants';
import type { FactionId, StateCode } from '@/domain/types';
import { FACTIONS } from '@/data/factions';
import { STATES } from '@/data/states';
import type { GameState } from '@/engine/loop/types';
import type { Forecast } from '@/hooks/useForecast';
import { selectFactionByState } from '@/store/selectors';
import { pct, signed } from '@/lib/format';
import { TileMap, type TileFill } from './TileMap';
import { StateDrawer } from './StateDrawer';
import {
  marginBin,
  marginBins,
  probabilityBin,
  probabilityBins,
  satisfactionBin,
  satisfactionBins,
  type Bin,
} from './scales';

type Mode = 'forecast' | 'result' | 'faction';

/** The map, its three lenses, a legend, and a table view of the same numbers. */
export function MapPanel({ game, forecast }: { game: GameState; forecast: Forecast }) {
  const [mode, setMode] = useState<Mode>('forecast');
  const [faction, setFaction] = useState<FactionId>('independent');
  const [selected, setSelected] = useState<StateCode | null>(null);
  const [asTable, setAsTable] = useState(false);
  const party = game.player.party;
  const lastElection = game.elections.at(-1);

  // State win probabilities: finished result, or the live snapshot while running.
  const probs = forecast.result
    ? Object.fromEntries(STATE_CODES.map((s) => [s, forecast.result!.states[s].winProbability]))
    : forecast.progress?.stateWinProbability;

  const view = useMemo(() => {
    let bins: Bin[];
    let value: (s: StateCode) => number | undefined;
    let bin: (v: number) => number;
    let fmt: (v: number) => string;
    let title: string;
    if (mode === 'result' && lastElection) {
      bins = marginBins(party);
      value = (s) => lastElection.stateMargins[s];
      bin = marginBin;
      fmt = (v) => `${signed(v)} pts`;
      title = `${lastElection.year} results, your margin`;
    } else if (mode === 'faction') {
      const by = selectFactionByState(game, faction);
      bins = satisfactionBins;
      value = (s) => by[s];
      bin = satisfactionBin;
      fmt = (v) => `${Math.round(v)} satisfaction`;
      title = `${FACTIONS[faction].label}: satisfaction with your party`;
    } else {
      bins = probabilityBins(party);
      value = (s) => probs?.[s];
      bin = probabilityBin;
      fmt = (v) => `${pct(v)} chance you carry it`;
      title = `${forecast.year} forecast, your chance of carrying each state`;
    }
    const fills: Partial<Record<StateCode, TileFill>> = {};
    for (const s of STATE_CODES) {
      const v = value(s);
      if (v === undefined) continue;
      const b = bins[bin(v)]!;
      fills[s] = { color: b.color, ink: b.inkOnFill };
    }
    return { bins, value, fmt, title, fills };
  }, [mode, lastElection, party, game, faction, probs, forecast.year]);

  const describe = (s: StateCode) => {
    const v = view.value(s);
    return `${STATES[s].name}, ${STATES[s].electoralVotes} electoral votes: ${v === undefined ? 'calculating' : view.fmt(v)}`;
  };

  const tabs: { id: Mode; label: string; disabled?: boolean }[] = [
    { id: 'forecast', label: 'Forecast' },
    { id: 'result', label: lastElection ? `${lastElection.year} results` : 'Results', disabled: !lastElection },
    { id: 'faction', label: 'Faction lens' },
  ];

  return (
    <section aria-labelledby="map-h">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="map-h" className="font-semibold">The map</h2>
          <p className="mt-1 text-sm text-ink-2">{view.title}. Select a state for its factions.</p>
        </div>
        <div role="tablist" aria-label="Map lens" className="flex rounded-md border border-ink/20 p-0.5 text-sm">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={mode === t.id}
              disabled={t.disabled}
              onClick={() => setMode(t.id)}
              className={`rounded px-3 py-1.5 font-medium disabled:text-ink-3 ${mode === t.id ? 'bg-ink text-white' : 'text-ink-2 hover:text-ink'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {mode === 'faction' && (
        <label className="mt-3 flex items-center gap-2 text-sm">
          Faction
          <select value={faction} onChange={(e) => setFaction(e.target.value as FactionId)} className="rounded border border-ink/25 bg-white px-2 py-1">
            {FACTION_IDS.map((f) => (
              <option key={f} value={f}>
                {FACTIONS[f].label}
              </option>
            ))}
          </select>
        </label>
      )}

      <div className="mt-4">
        {asTable ? (
          <StateTable view={view} onSelect={setSelected} />
        ) : (
          <TileMap fills={view.fills} describe={describe} onSelect={setSelected} selected={selected} label={view.title} />
        )}
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-xs text-ink-2" aria-label="Legend">
          {view.bins.map((b) => (
            <li key={b.label} className="flex items-center gap-1.5">
              <span className="h-3 w-3 rounded-sm border border-ink/15" style={{ background: b.color }} aria-hidden />
              {b.label}
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => setAsTable((t) => !t)} className="text-sm text-ink-2 underline-offset-4 hover:text-ink hover:underline">
          {asTable ? 'Show the map' : 'Show as a table'}
        </button>
      </div>

      {selected && <StateDrawer game={game} state={selected} forecast={forecast} onClose={() => setSelected(null)} />}
    </section>
  );
}

function StateTable({
  view,
  onSelect,
}: {
  view: { value: (s: StateCode) => number | undefined; fmt: (v: number) => string; title: string };
  onSelect: (s: StateCode) => void;
}) {
  const rows = [...STATE_CODES].sort((a, b) => (view.value(b) ?? 0) - (view.value(a) ?? 0));
  return (
    <div className="max-h-[28rem] overflow-auto rounded-md border border-rule">
      <table className="w-full text-sm">
        <caption className="sr-only">{view.title}</caption>
        <thead className="sticky top-0 bg-marble text-left text-ink-2">
          <tr>
            <th className="px-3 py-2 font-medium">State</th>
            <th className="px-3 py-2 text-right font-medium">Electoral votes</th>
            <th className="px-3 py-2 text-right font-medium">Value</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((s) => {
            const v = view.value(s);
            return (
              <tr key={s} className="border-t border-rule">
                <td className="px-3 py-1.5">
                  <button type="button" onClick={() => onSelect(s)} className="underline-offset-4 hover:underline">
                    {STATES[s].name}
                  </button>
                </td>
                <td className="px-3 py-1.5 text-right tabular-nums">{STATES[s].electoralVotes}</td>
                <td className="px-3 py-1.5 text-right tabular-nums">{v === undefined ? 'n/a' : view.fmt(v)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
