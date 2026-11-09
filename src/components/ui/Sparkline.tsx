import { useId, useState } from 'react';

/**
 * Single-series sparkline (2px line, recessive baseline) with a hover layer:
 * pointer or keyboard focus shows the value at each point. The metric tile's
 * title names the series, so no legend is needed.
 */
export function Sparkline({
  values,
  labels,
  format,
  width = 132,
  height = 36,
  ariaLabel,
}: {
  values: number[];
  labels: string[];
  format: (v: number) => string;
  width?: number;
  height?: number;
  ariaLabel: string;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const titleId = useId();
  if (values.length < 2) {
    return <div className="text-xs text-ink-3" style={{ height }}>Trend appears after the first turn</div>;
  }

  const pad = 4;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / (values.length - 1)) * (width - pad * 2);
  const y = (v: number) => height - pad - ((v - min) / span) * (height - pad * 2);
  const d = values.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = values.length - 1;
  const shown = hover ?? last;

  const pick = (clientX: number, rect: DOMRect) => {
    const rel = ((clientX - rect.left) / rect.width) * width;
    const i = Math.round(((rel - pad) / (width - pad * 2)) * (values.length - 1));
    setHover(Math.max(0, Math.min(last, i)));
  };

  return (
    <div className="relative">
      <svg
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-labelledby={titleId}
        tabIndex={0}
        className="block cursor-crosshair overflow-visible"
        onPointerMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
        onPointerLeave={() => setHover(null)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setHover((h) => Math.max(0, (h ?? last) - 1));
          if (e.key === 'ArrowRight') setHover((h) => Math.min(last, (h ?? last) + 1));
        }}
        onBlur={() => setHover(null)}
      >
        <title id={titleId}>{ariaLabel}</title>
        <line x1={pad} x2={width - pad} y1={height - pad} y2={height - pad} stroke="var(--color-rule)" />
        <path d={d} fill="none" stroke="var(--color-ink-2)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {hover !== null && (
          <line x1={x(hover)} x2={x(hover)} y1={pad} y2={height - pad} stroke="var(--color-ink-3)" strokeDasharray="2 2" />
        )}
        <circle cx={x(shown)} cy={y(values[shown]!)} r={4} fill="var(--color-ink)" stroke="var(--color-panel)" strokeWidth={2} />
      </svg>
      {hover !== null && (
        <div
          role="status"
          className="pointer-events-none absolute -top-7 z-10 whitespace-nowrap rounded bg-ink px-2 py-0.5 text-xs text-white"
          style={{ left: Math.min(Math.max(x(hover) - 30, -8), width - 60) }}
        >
          {labels[hover]}: {format(values[hover]!)}
        </div>
      )}
    </div>
  );
}
