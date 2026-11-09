import type { GameState } from '@/engine/loop/types';
import type { Forecast } from '@/hooks/useForecast';
import { pct } from '@/lib/format';

/**
 * Headline numbers from the shared 10,000-simulation forecast (see useForecast).
 * The forecast seed is derived from the state, so it never touches game randomness.
 */
export function ForecastPanel({ game, forecast }: { game: GameState; forecast: Forecast }) {
  const { status, progress, result, elapsedMs, year } = forecast;
  const presidential = forecast.kind === 'presidential';
  const congress = result?.congress;
  const live = status === 'running' && progress;

  return (
    <section aria-labelledby="forecast-h" aria-busy={status === 'running'}>
      <h2 id="forecast-h" className="font-semibold">
        {year} {presidential ? 'election' : 'midterm'} forecast
      </h2>
      <p className="mt-1 text-sm text-ink-2">
        {live
          ? `Simulating: ${progress.completedRuns.toLocaleString()} of ${progress.totalRuns.toLocaleString()} runs`
          : result
            ? `${result.runs.toLocaleString()} simulated elections in ${Math.round(elapsedMs ?? 0)} ms`
            : 'Preparing the simulation'}
      </p>

      {presidential && (
        <div className="mt-4">
          <div className="font-serif text-5xl font-black tabular-nums">
            {pct(live ? progress.winProbability : (result?.winProbability ?? 0))}
          </div>
          <div className="mt-1 text-sm text-ink-2">
            chance {game.player.isPresident ? 'you are re-elected' : 'you win the White House'}
            {result && `; median ${Math.round(result.electoralVotes.median)} electoral votes (90% range ${Math.round(result.electoralVotes.p5)} to ${Math.round(result.electoralVotes.p95)})`}
          </div>
        </div>
      )}

      {congress && (
        <dl className="mt-4 grid grid-cols-2 gap-4 border-t border-rule pt-4">
          <div>
            <dt className="text-sm text-ink-2">House majority</dt>
            <dd className="text-2xl font-semibold tabular-nums">{pct(congress.house.majorityProbability)}</dd>
            <dd className="text-xs text-ink-3">median {Math.round(congress.house.median)} seats</dd>
          </div>
          <div>
            <dt className="text-sm text-ink-2">Senate control</dt>
            <dd className="text-2xl font-semibold tabular-nums">{pct(congress.senate.majorityProbability)}</dd>
            <dd className="text-xs text-ink-3">median {Math.round(congress.senate.median)} seats</dd>
          </div>
        </dl>
      )}

      {result && presidential && result.tippingPoints.length > 0 && (
        <p className="mt-4 text-sm text-ink-2">
          Most likely tipping point: <span className="font-semibold text-ink">{result.tippingPoints[0]!.unitId}</span> ({pct(result.tippingPoints[0]!.probability)} of simulations).
        </p>
      )}
    </section>
  );
}
