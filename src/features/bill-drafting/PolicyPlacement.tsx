import { POLICY_AXES, POLICY_AXIS_LABELS } from '@/domain/constants';
import type { PolicyVector, SparsePolicyVector } from '@/domain/types';

/**
 * Dot plot: where the bill sits on each axis it touches, next to the player's
 * platform and the opposition's. Three marks with three shapes and a legend,
 * so identity never rests on color alone.
 */
export function PolicyPlacement({
  bill,
  player,
  opposition,
  playerColor,
  oppositionColor,
}: {
  bill: SparsePolicyVector;
  player: PolicyVector;
  opposition: PolicyVector;
  playerColor: string;
  oppositionColor: string;
}) {
  const axes = POLICY_AXES.filter((a) => bill[a] !== null);
  if (axes.length === 0) return <p className="text-sm text-ink-2">This bill does not take a clear position on any policy axis.</p>;
  const x = (v: number) => `${((v + 10) / 20) * 100}%`;

  return (
    <div>
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-ink-2" aria-label="Legend">
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rotate-45 bg-ink" aria-hidden /> This bill
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full" style={{ background: playerColor }} aria-hidden /> Your platform
        </li>
        <li className="flex items-center gap-1.5">
          <span className="h-3 w-3 rounded-full border-2 bg-panel" style={{ borderColor: oppositionColor }} aria-hidden /> The opposition
        </li>
      </ul>
      <dl className="mt-3 space-y-3">
        {axes.map((a) => {
          const b = bill[a]!;
          return (
            <div key={a}>
              <dt className="flex justify-between text-xs text-ink-3">
                <span>{POLICY_AXIS_LABELS[a].neg}</span>
                <span>{POLICY_AXIS_LABELS[a].pos}</span>
              </dt>
              <dd
                className="relative mt-1 h-5"
                aria-label={`${POLICY_AXIS_LABELS[a].neg} to ${POLICY_AXIS_LABELS[a].pos}: bill ${b}, your platform ${player[a].toFixed(1)}, opposition ${opposition[a].toFixed(1)}`}
              >
                <div className="absolute top-1/2 right-0 left-0 h-px bg-rule" />
                <div className="absolute top-1/2 left-1/2 h-2.5 w-px -translate-y-1/2 bg-ink-3" aria-hidden />
                <span
                  className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-panel"
                  style={{ left: x(opposition[a]), borderColor: oppositionColor }}
                  title={`Opposition: ${opposition[a].toFixed(1)}`}
                />
                <span
                  className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-panel"
                  style={{ left: x(player[a]), background: playerColor }}
                  title={`Your platform: ${player[a].toFixed(1)}`}
                />
                <span
                  className="absolute top-1/2 h-3 w-3 -translate-x-1/2 -translate-y-1/2 rotate-45 bg-ink ring-2 ring-panel"
                  style={{ left: x(b) }}
                  title={`This bill: ${b}`}
                />
              </dd>
            </div>
          );
        })}
      </dl>
    </div>
  );
}
