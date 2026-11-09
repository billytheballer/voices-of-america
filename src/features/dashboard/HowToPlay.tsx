import { useRef } from 'react';
import { Button } from '@/components/ui/Button';

const STEPS = [
  ['Win the nomination', 'In primary season, pledge to your party’s wings, but every pledge pulls your platform away from the center. Lose your own base and you lose the primary.'],
  ['Campaign', 'Each campaign quarter you get three moves: fundraise, rally, buy ads, or go after your opponent with attacks on their record, opposition research and attack ads. Go negative too often and it backfires. Your opponent advertises and attacks you back.'],
  ['Win the election', 'The forecast runs 10,000 simulated elections after every change. On election night, polls close east to west and one of those futures becomes real.'],
  ['Govern', 'Write bills in plain English and spend political capital to bring them to a vote, or sign them as executive orders and risk the courts. Run the sixteen departments: redirect them by executive order, or ask Congress to grow, cut or eliminate them.'],
  ['Watch the country', 'Crises land every quarter, the economy drifts, and twenty Americans react in the feed. Voters blame whoever holds the White House.'],
  ['Keep going', 'Midterms reshape Congress. After two terms, name a successor and run again. The game ends only when your party loses the presidency or a primary.'],
] as const;

export function HowToPlay() {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <Button variant="quiet" className="text-white/70 hover:text-white" onClick={() => ref.current?.showModal()}>
        How to play
      </Button>
      <dialog ref={ref} aria-labelledby="howto-h" className="m-auto w-[min(40rem,92vw)] rounded-lg border border-rule bg-panel p-0 text-ink backdrop:bg-ink/60">
        <div className="p-7">
          <h2 id="howto-h" className="font-serif text-3xl font-black">How to play</h2>
          <ol className="mt-5 space-y-4">
            {STEPS.map(([title, body], i) => (
              <li key={title} className="grid grid-cols-[1.75rem_1fr] gap-x-2">
                <span className="font-serif text-xl font-bold text-brass-dark tabular-nums">{i + 1}</span>
                <div>
                  <h3 className="font-semibold">{title}</h3>
                  <p className="mt-0.5 text-sm leading-relaxed text-ink-2">{body}</p>
                </div>
              </li>
            ))}
          </ol>
          <div className="mt-6 flex justify-end">
            <Button variant="primary" onClick={() => ref.current?.close()} autoFocus>
              Got it
            </Button>
          </div>
        </div>
      </dialog>
    </>
  );
}
