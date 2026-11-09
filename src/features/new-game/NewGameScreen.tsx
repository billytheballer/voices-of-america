import { useMemo, useState } from 'react';
import { DIFFICULTY, type Difficulty } from '@/data/balance.config';
import type { Party } from '@/domain/types';
import { Button } from '@/components/ui/Button';
import { listSaves } from '@/services/persistence/saveGame';
import { localStorageAdapter } from '@/services/persistence/storage';
import { useGameStore } from '@/store/gameStore';
import { PARTY_COLOR_VAR, PARTY_NAME, quarterLabel } from '@/lib/format';

const PARTY_BLURB: Record<Party, string> = {
  R: 'Hold together America First populists, traditional conservatives and the business wing.',
  D: 'Hold together the party establishment, progressives and rural moderates.',
};

const DIFFICULTY_BLURB: Record<Difficulty, string> = {
  realistic: 'The real map, including the Electoral College tilt.',
  balanced: 'The map is shifted so the tipping-point state starts tied.',
  hard: 'Balanced, then you start three points behind.',
};

function safeSaves() {
  try {
    return listSaves(localStorageAdapter);
  } catch {
    return [];
  }
}

export function NewGameScreen() {
  const startGame = useGameStore((s) => s.newGame);
  const load = useGameStore((s) => s.load);
  const [name, setName] = useState('');
  const [party, setParty] = useState<Party>('D');
  const [difficulty, setDifficulty] = useState<Difficulty>('realistic');
  const saves = useMemo(safeSaves, []);
  const trimmed = name.trim();

  return (
    <main id="main" className="mx-auto grid min-h-screen max-w-5xl content-center gap-12 px-6 py-16 md:grid-cols-[1.1fr_1fr]">
      <section>
        <h1 className="font-serif text-5xl leading-[1.05] font-black tracking-tight text-ink md:text-6xl">
          Voices of America
        </h1>
        <p className="mt-5 max-w-md text-lg leading-relaxed text-ink-2">
          Run for president in 2028. Win, then govern a country of eight restless factions, one bill at a time.
          Every election is simulated 10,000 times before the real one is decided.
        </p>
        {saves.length > 0 && (
          <div className="mt-10 border-t border-rule pt-6">
            <h2 className="text-sm font-semibold text-ink-2">Continue a campaign</h2>
            <ul className="mt-3 space-y-2">
              {saves.map((s) => (
                <li key={s.slot}>
                  <button
                    type="button"
                    onClick={() => load(s.slot)}
                    className="flex w-full items-center justify-between rounded-md border border-rule bg-panel px-4 py-3 text-left hover:border-ink/40"
                  >
                    <span>
                      <span className="font-semibold">{s.candidate}</span>{' '}
                      <span className="text-ink-2">({PARTY_NAME[s.party]})</span>
                    </span>
                    <span className="text-sm text-ink-3">
                      {quarterLabel(s.year, s.quarter)}, {s.slot === 'autosave' ? 'autosave' : s.slot.replace('-', ' ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      <form
        className="space-y-7 rounded-lg border border-rule bg-panel p-7"
        onSubmit={(e) => {
          e.preventDefault();
          if (!trimmed) return;
          startGame({ seed: Math.floor(Math.random() * 2 ** 31), playerName: trimmed, party, difficulty });
        }}
      >
        <div>
          <label htmlFor="candidate" className="text-sm font-semibold">
            Candidate name
          </label>
          <input
            id="candidate"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={40}
            placeholder="e.g. Jordan Ellis"
            className="mt-2 w-full rounded-md border border-ink/25 bg-white px-3 py-2.5 text-base outline-none focus:border-brass"
            autoComplete="off"
          />
        </div>

        <fieldset>
          <legend className="text-sm font-semibold">Party</legend>
          <div className="mt-2 grid grid-cols-2 gap-3">
            {(['D', 'R'] as const).map((p) => (
              <label
                key={p}
                className={`cursor-pointer rounded-md border-2 p-3 ${party === p ? 'border-ink bg-white' : 'border-rule'}`}
              >
                <input type="radio" name="party" value={p} checked={party === p} onChange={() => setParty(p)} className="sr-only" />
                <span className="flex items-center gap-2 font-semibold">
                  <span className="h-3 w-3 rounded-full" style={{ background: PARTY_COLOR_VAR[p] }} aria-hidden />
                  {PARTY_NAME[p]}
                </span>
                <span className="mt-1 block text-xs leading-snug text-ink-2">{PARTY_BLURB[p]}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset>
          <legend className="text-sm font-semibold">Difficulty</legend>
          <div className="mt-2 space-y-2">
            {(Object.keys(DIFFICULTY) as Difficulty[]).map((d) => (
              <label key={d} className="flex cursor-pointer items-start gap-3">
                <input
                  type="radio"
                  name="difficulty"
                  value={d}
                  checked={difficulty === d}
                  onChange={() => setDifficulty(d)}
                  className="mt-1 accent-[var(--color-brass)]"
                />
                <span>
                  <span className="font-medium">{DIFFICULTY[d].label}</span>
                  <span className="block text-xs text-ink-2">{DIFFICULTY_BLURB[d]}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <Button type="submit" variant="primary" disabled={!trimmed} className="w-full py-3 text-base">
          Launch the campaign
        </Button>
      </form>
    </main>
  );
}
