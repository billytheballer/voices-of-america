import { METRIC_IDS } from '@/domain/constants';
import type { GameState } from '@/engine/loop/types';
import { Sparkline } from '@/components/ui/Sparkline';
import { METRIC_META, quarterLabel } from '@/lib/format';

/** The five national metrics: value, change since last quarter, and trend. */
export function MetricsStrip({ game }: { game: GameState }) {
  const history = game.log.slice(-11);
  const labels = [...history.map((r) => quarterLabel(r.year, r.quarter)), quarterLabel(game.year, game.quarter)];

  return (
    <section aria-label="National metrics" className="grid grid-cols-2 gap-px border-y border-rule bg-rule sm:grid-cols-3 xl:grid-cols-5">
      {METRIC_IDS.map((m) => {
        const meta = METRIC_META[m];
        const series = [...history.map((r) => r.metrics[m]), game.metrics[m]];
        const prev = history.at(-1)?.metrics[m];
        const delta = prev === undefined ? 0 : game.metrics[m] - prev;
        const worse = meta.higherIsWorse ? delta > 0 : delta < 0;
        const flat = Math.abs(delta) < 1e-6;
        return (
          <div key={m} className="bg-marble px-4 py-4">
            <div className="text-sm text-ink-2">{meta.label}</div>
            <div className="mt-1 text-2xl font-semibold tabular-nums">{meta.format(game.metrics[m])}</div>
            <div className="mt-0.5 text-xs text-ink-2">
              {flat ? (
                'No change'
              ) : (
                <>
                  <span aria-hidden>{delta > 0 ? '▲' : '▼'}</span> {meta.format(Math.abs(delta))}{' '}
                  {worse ? 'worse' : 'better'}
                </>
              )}
            </div>
            <div className="mt-2">
              <Sparkline values={series} labels={labels} format={meta.format} ariaLabel={`${meta.label} trend`} />
            </div>
          </div>
        );
      })}
    </section>
  );
}
