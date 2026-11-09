import { EVENTS } from '@/data/events';
import { METRIC_IDS } from '@/domain/constants';
import type { GameState } from '@/engine/loop/types';
import { selectCurrentEvent } from '@/store/selectors';
import { METRIC_META, quarterLabel } from '@/lib/format';

const SEVERITY_WORD = ['', 'Minor', 'Notable', 'Serious', 'Severe', 'Critical'] as const;

/**
 * The hero of the dashboard: this quarter's crisis, set like a front-page
 * headline. The "crisis-in" animation is the dashboard's one orchestrated
 * motion moment, keyed on the event so it replays only when the news changes.
 */
export function CrisisBrief({ game }: { game: GameState }) {
  const event = selectCurrentEvent(game);
  const recent = game.log.slice(-4).reverse();
  const shocks = METRIC_IDS.filter((m) => event.metricShocks[m]);

  return (
    <section aria-labelledby="crisis-headline" className="border-b border-rule pb-6">
      <div key={`${event.id}-${game.turn}`} className="crisis-in">
        <p className="text-sm text-ink-2">
          {SEVERITY_WORD[event.severity]} {event.category === 'economy' ? 'economic' : event.category} news,{' '}
          {quarterLabel(game.year, game.quarter)}
          {event.demandsResponse && <span className="ml-2 rounded bg-brass-tint px-1.5 py-0.5 text-brass-dark">Response expected</span>}
        </p>
        <h2 id="crisis-headline" className="mt-2 max-w-3xl font-serif text-3xl leading-tight font-bold text-ink md:text-[2.5rem]">
          {event.headline}
        </h2>
        <p className="mt-3 max-w-2xl font-serif text-lg leading-relaxed text-ink-2">{event.description}</p>
        {shocks.length > 0 && (
          <p className="mt-3 text-sm text-ink-2">
            Pressure on: {shocks.map((m) => METRIC_META[m].label.toLowerCase()).join(', ')}.
          </p>
        )}
      </div>

      {recent.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-ink-2">Earlier this term</h3>
          <ol className="mt-2 space-y-1 text-sm">
            {recent.map((r) => {
              const e = EVENTS.find((x) => x.id === r.eventId);
              return (
                <li key={r.turn} className="flex gap-3">
                  <span className="w-16 shrink-0 text-ink-3 tabular-nums">{quarterLabel(r.year, r.quarter)}</span>
                  <span className="text-ink-2">
                    {e?.headline}
                    {r.bills.map((b) => (
                      <span key={b.title} className="text-ink">
                        {' '}
                        Your {b.title}: {b.outcome.replace(/_/g, ' ')}.
                      </span>
                    ))}
                  </span>
                </li>
              );
            })}
          </ol>
        </div>
      )}
    </section>
  );
}
