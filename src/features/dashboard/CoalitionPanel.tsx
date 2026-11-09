import { useState } from 'react';
import { COALITION_IDS } from '@/domain/constants';
import type { CoalitionId } from '@/domain/types';
import { FACTIONS } from '@/data/factions';
import type { GameState } from '@/engine/loop/types';
import { selectCoalitionSatisfaction, selectCoalitionSize } from '@/store/selectors';
import { pct } from '@/lib/format';

const COALITION_COLOR: Record<CoalitionId, string> = {
  gop: 'var(--color-gop)',
  dem: 'var(--color-dem)',
  third: 'var(--color-third)',
};

/**
 * Satisfaction with the player's party in three coalition rows. Each row
 * expands to its factions (the 8-way split). Bars run 0–100 with a marker at
 * 50 (neutral); every bar carries its number, so color is never the only cue.
 */
export function CoalitionPanel({ game }: { game: GameState }) {
  const [open, setOpen] = useState<CoalitionId | null>(null);
  const sat = selectCoalitionSatisfaction(game);
  const size = selectCoalitionSize();

  return (
    <section aria-labelledby="coalitions-h">
      <h2 id="coalitions-h" className="font-semibold">How the factions feel about you</h2>
      <p className="mt-1 text-sm text-ink-2">Satisfaction with your party; 50 is neutral. Select a coalition to see its factions.</p>
      <ul className="mt-4 space-y-3">
        {COALITION_IDS.map((c) => {
          const b = sat[c];
          const expanded = open === c;
          return (
            <li key={c}>
              <button
                type="button"
                aria-expanded={expanded}
                onClick={() => setOpen(expanded ? null : c)}
                className="w-full text-left"
              >
                <Row
                  label={b.label}
                  sub={`${pct(size[c].value)} of voters`}
                  value={b.value}
                  color={COALITION_COLOR[c]}
                  chevron={expanded ? '−' : '+'}
                />
              </button>
              {expanded && (
                <ul className="mt-2 ml-3 space-y-2 border-l border-rule pl-3">
                  {b.members.map((m) => (
                    <li key={m.faction}>
                      <Row label={FACTIONS[m.faction].label} sub={`${pct(m.weight)} of voters`} value={m.value} color={COALITION_COLOR[c]} small />
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Row({ label, sub, value, color, chevron, small = false }: { label: string; sub: string; value: number; color: string; chevron?: string; small?: boolean }) {
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className={`min-w-0 ${small ? 'text-sm' : 'font-medium'}`}>
          {chevron && <span className="mr-1.5 inline-block w-3 text-ink-3" aria-hidden>{chevron}</span>}
          {label}
        </span>
        <span className="shrink-0 text-sm">
          <span className="mr-2 text-xs text-ink-3">{sub}</span>
          <span className="font-semibold tabular-nums">{Math.round(value)}</span>
        </span>
      </div>
      <div className="relative mt-1 h-2 rounded-full bg-rule/60">
        <div className="h-full rounded-full" style={{ width: `${Math.max(2, value)}%`, background: color, opacity: small ? 0.8 : 1 }} />
        <div className="absolute -top-0.5 -bottom-0.5 left-1/2 w-px bg-ink/50" aria-hidden />
      </div>
    </div>
  );
}
