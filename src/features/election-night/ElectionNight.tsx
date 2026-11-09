import { useEffect, useMemo, useRef, useState } from 'react';
import type { StateCode } from '@/domain/types';
import { STATES } from '@/data/states';
import { pollCloseLabel } from '@/data/tileGrid';
import { Button } from '@/components/ui/Button';
import type { ElectionRecord, GameState } from '@/engine/loop/types';
import { TileMap, type TileFill } from '@/features/map/TileMap';
import { marginBin, marginBins } from '@/features/map/scales';
import { PARTY_ADJ, PARTY_COLOR_VAR, signed } from '@/lib/format';
import { CLOSING_HOURS, revealFrame } from './revealSchedule';

const BEAT_MS = 900;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/**
 * Election night: the dashboard's big orchestrated moment. Polls close
 * east to west; each beat calls a group of states, the map fills in and the
 * electoral-vote tally climbs. Skippable, and instant under reduced motion.
 */
export function ElectionNight({ record, game, onClose }: { record: ElectionRecord; game: GameState; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const last = CLOSING_HOURS.length - 1;
  const [beat, setBeat] = useState(() => (prefersReducedMotion() ? last : 0));
  const done = beat >= last;
  const presidential = record.kind === 'presidential';
  const me = game.player.party;
  const them = me === 'R' ? 'D' : 'R';

  useEffect(() => {
    const d = ref.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => setBeat((b) => b + 1), BEAT_MS);
    return () => clearTimeout(t);
  }, [beat, done]);

  const frame = revealFrame(record, beat);
  const bins = useMemo(() => marginBins(me), [me]);
  const fills = useMemo(() => {
    const out: Partial<Record<StateCode, TileFill>> = {};
    for (const s of Object.keys(record.stateMargins) as StateCode[]) {
      const b = bins[marginBin(record.stateMargins[s])]!;
      out[s] = { color: b.color, ink: b.inkOnFill };
    }
    return out;
  }, [record, bins]);

  const headline = !done
    ? presidential
      ? 'Votes are being counted'
      : 'Midterm returns are coming in'
    : presidential
      ? record.won
        ? `${record.candidate} wins the presidency`
        : `${record.candidate} loses the election`
      : 'The midterm results are in';

  const flips = (record.senateResults ?? []).filter((r) => r.winner !== r.previousHolder);

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="night-h" className="m-0 h-full max-h-none w-full max-w-none bg-marble p-0 text-ink">
      <div className="mx-auto flex min-h-full max-w-6xl flex-col px-6 py-8">
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <p className="text-ink-2">
              {record.year} {presidential ? 'general election' : 'midterm election'}, {pollCloseLabel(frame.hour)} Eastern
            </p>
            <h2 id="night-h" className="mt-1 font-serif text-4xl leading-tight font-black md:text-5xl" aria-live="polite">
              {headline}
            </h2>
          </div>
          {!done && (
            <Button variant="secondary" onClick={() => setBeat(last)}>
              Skip to the result
            </Button>
          )}
        </div>

        {presidential && (
          <div className="mt-6" aria-live="polite">
            <div className="flex justify-between text-lg">
              <span>
                <span className="font-serif text-4xl font-black tabular-nums">{frame.playerEV}</span>{' '}
                <span className="text-ink-2">{record.candidate}</span>
              </span>
              <span>
                <span className="text-ink-2">{PARTY_ADJ[them]} nominee</span>{' '}
                <span className="font-serif text-4xl font-black tabular-nums">{frame.oppositionEV}</span>
              </span>
            </div>
            <div className="relative mt-2 flex h-4 gap-[2px] rounded bg-rule/60" role="img" aria-label={`${frame.playerEV} to ${frame.oppositionEV} electoral votes`}>
              <div className="rounded-l transition-[width] duration-500" style={{ width: `${(frame.playerEV / 538) * 100}%`, background: PARTY_COLOR_VAR[me] }} />
              <div className="flex-1" />
              <div className="rounded-r transition-[width] duration-500" style={{ width: `${(frame.oppositionEV / 538) * 100}%`, background: PARTY_COLOR_VAR[them] }} />
              <div className="absolute -top-1.5 -bottom-1.5 left-1/2 w-0.5 bg-ink" title="270 to win" />
            </div>
            <p className="mt-1 text-center text-xs text-ink-3">270 to win</p>
          </div>
        )}

        <div className="mt-6 grid flex-1 gap-8 lg:grid-cols-[minmax(0,1fr)_18rem]">
          <TileMap
            fills={fills}
            revealed={frame.revealed}
            label={`${record.year} results by state`}
            describe={(s) =>
              frame.revealed.has(s)
                ? `${STATES[s].name}: ${record.stateMargins[s] > 0 ? 'yours' : 'opposition'}, ${signed(record.stateMargins[s])} pts`
                : `${STATES[s].name}: polls still open`
            }
          />

          <aside className="space-y-6">
            {!done ? (
              <div>
                <h3 className="font-semibold">Polls closing at {pollCloseLabel(frame.hour)}</h3>
                <ul className="mt-2 space-y-1 text-sm">
                  {frame.justCalled.map((s) => (
                    <li key={s} className="flex justify-between">
                      <span>{STATES[s].name}</span>
                      <span className="tabular-nums text-ink-2">
                        {record.stateMargins[s] > 0 ? 'Yours' : 'Opposition'}, {signed(record.stateMargins[s])}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ) : (
              <dl className="grid grid-cols-2 gap-4">
                <div>
                  <dt className="text-sm text-ink-2">Popular vote margin</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{signed(record.popularMargin)}</dd>
                </div>
                {presidential && (
                  <div>
                    <dt className="text-sm text-ink-2">Electoral votes</dt>
                    <dd className="text-2xl font-semibold tabular-nums">{record.playerEV}</dd>
                  </div>
                )}
                <div>
                  <dt className="text-sm text-ink-2">{PARTY_ADJ[me]} House seats</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{record.houseSeats}</dd>
                </div>
                <div>
                  <dt className="text-sm text-ink-2">{PARTY_ADJ[me]} Senate seats</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{record.senateSeats}</dd>
                </div>
              </dl>
            )}

            {done && (
              <div>
                <h3 className="font-semibold">Senate seats that changed hands</h3>
                {flips.length === 0 ? (
                  <p className="mt-1 text-sm text-ink-2">None. Every seat stayed with its party.</p>
                ) : (
                  <ul className="mt-2 space-y-1 text-sm">
                    {flips.map((f) => (
                      <li key={f.state}>
                        {STATES[f.state].name}: {f.winner === me ? 'you gained it' : 'you lost it'}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            {done && (
              <Button variant="primary" className="w-full py-3" onClick={() => ref.current?.close()} autoFocus>
                {game.gameOver ? 'See the final record' : presidential && record.won ? 'Take the oath of office' : 'Back to governing'}
              </Button>
            )}
          </aside>
        </div>
      </div>
    </dialog>
  );
}
