import { COALITION_IDS, COALITION_LABELS, COALITION_MEMBERS } from '@/domain/constants';
import type { BillAnalysis } from '@/domain/schemas/billAnalysis.schema';
import type { FactionRecord } from '@/domain/types';
import { FACTIONS } from '@/data/factions';
import { STATES } from '@/data/states';
import { signed } from '@/lib/format';

/**
 * Each faction's reaction as a centered bar (−10 … +10), grouped by coalition,
 * with the analyst's one-line reason and the projected change in that faction's
 * national satisfaction (which includes the deterministic faction rules).
 */
export function FactionReactions({ analysis, projected }: { analysis: BillAnalysis; projected: FactionRecord<number> }) {
  return (
    <div className="space-y-4">
      {COALITION_IDS.map((c) => (
        <div key={c}>
          <h4 className="text-xs font-semibold text-ink-2">{COALITION_LABELS[c]}</h4>
          <ul className="mt-1.5 space-y-2">
            {COALITION_MEMBERS[c].map((f) => {
              const { delta, reason } = analysis.faction_modifiers[f];
              const p = projected[f];
              return (
                <li key={f} className="grid grid-cols-[11.5rem_1fr_3.5rem] items-center gap-3 text-sm max-sm:grid-cols-[1fr_3.5rem]">
                  <span className="truncate" title={FACTIONS[f].label}>{FACTIONS[f].label}</span>
                  <span className="relative h-2 rounded-full bg-rule/60 max-sm:order-3 max-sm:col-span-2" aria-hidden>
                    <span className="absolute top-[-3px] bottom-[-3px] left-1/2 w-px bg-ink-3" />
                    <span
                      className="absolute top-0 bottom-0 rounded-full"
                      style={{
                        left: delta >= 0 ? '50%' : `${50 + delta * 5}%`,
                        width: `${Math.abs(delta) * 5}%`,
                        background: delta >= 0 ? 'var(--color-ink)' : 'var(--color-ink-3)',
                      }}
                    />
                  </span>
                  <span className="text-right font-semibold tabular-nums" title="Projected change in national satisfaction, including faction rules">
                    {signed(p)}
                  </span>
                  <span className="col-span-3 -mt-1.5 text-xs text-ink-2 max-sm:col-span-2">{reason}</span>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
      {analysis.state_overrides.length > 0 && (
        <div>
          <h4 className="text-xs font-semibold text-ink-2">Local effects</h4>
          <ul className="mt-1.5 space-y-1 text-sm">
            {analysis.state_overrides.map((o) => (
              <li key={`${o.state}-${o.faction}`}>
                {STATES[o.state].name}, {FACTIONS[o.faction].label}: {signed(o.delta, 0)} ({o.reason})
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
