/**
 * Two-segment horizontal bar (player | opposition) with a 2px surface gap and
 * optional threshold markers, e.g. 218 for a House majority or 60 for cloture.
 * Identity is never carried by color alone: both segments are direct-labeled.
 */
export function SplitBar({
  left,
  right,
  leftColor,
  rightColor,
  leftLabel,
  rightLabel,
  markers = [],
}: {
  left: number;
  right: number;
  leftColor: string;
  rightColor: string;
  leftLabel: string;
  rightLabel: string;
  markers?: { at: number; label: string }[];
}) {
  const total = left + right || 1;
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span>
          <span className="font-semibold tabular-nums">{left}</span> <span className="text-ink-2">{leftLabel}</span>
        </span>
        <span>
          <span className="text-ink-2">{rightLabel}</span> <span className="font-semibold tabular-nums">{right}</span>
        </span>
      </div>
      <div className="relative mt-1.5 flex h-3 gap-[2px]" role="img" aria-label={`${leftLabel} ${left}, ${rightLabel} ${right}`}>
        <div className="rounded-l" style={{ width: `${(left / total) * 100}%`, background: leftColor }} />
        <div className="flex-1 rounded-r" style={{ background: rightColor }} />
        {markers.map((m) => (
          <div
            key={m.label}
            className="absolute -top-1 -bottom-1 w-px bg-ink"
            style={{ left: `${(m.at / total) * 100}%` }}
            title={m.label}
          />
        ))}
      </div>
      {markers.length > 0 && (
        <div className="mt-1 text-xs text-ink-3">{markers.map((m) => m.label).join('; ')}</div>
      )}
    </div>
  );
}
