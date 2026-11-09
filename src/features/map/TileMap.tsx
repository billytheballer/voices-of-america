import { useState, type KeyboardEvent } from 'react';
import { STATE_CODES } from '@/domain/constants';
import type { StateCode } from '@/domain/types';
import { STATES } from '@/data/states';
import { TILES, TILE_COLS, TILE_ROWS } from '@/data/tileGrid';

export interface TileFill {
  color: string;
  ink: 'light' | 'dark';
}

const SIZE = 56;
const GAP = 4;
const W = TILE_COLS * (SIZE + GAP);
const H = TILE_ROWS * (SIZE + GAP);

/**
 * Equal-area tile map. Tiles are keyboard-focusable buttons (arrow keys move
 * between neighbors) with a hover/focus tooltip. States not yet revealed
 * (election night) render as empty outlines.
 */
export function TileMap({
  fills,
  describe,
  onSelect,
  selected,
  revealed,
  label,
}: {
  fills: Partial<Record<StateCode, TileFill>>;
  describe: (s: StateCode) => string;
  onSelect?: (s: StateCode) => void;
  selected?: StateCode | null;
  revealed?: ReadonlySet<StateCode>;
  label: string;
}) {
  const [hover, setHover] = useState<StateCode | null>(null);

  const move = (from: StateCode, e: KeyboardEvent) => {
    const d = { ArrowLeft: [0, -1], ArrowRight: [0, 1], ArrowUp: [-1, 0], ArrowDown: [1, 0] }[e.key];
    if (!d) return;
    e.preventDefault();
    const t = TILES[from];
    // Nearest tile in that direction.
    let best: StateCode | null = null;
    let bestScore = Infinity;
    for (const s of STATE_CODES) {
      const o = TILES[s];
      const dr = o.row - t.row;
      const dc = o.col - t.col;
      if ((d[0] !== 0 && Math.sign(dr) !== d[0]) || (d[1] !== 0 && Math.sign(dc) !== d[1])) continue;
      const score = d[0] !== 0 ? Math.abs(dr) * 10 + Math.abs(dc) : Math.abs(dc) * 10 + Math.abs(dr);
      if (score < bestScore) [best, bestScore] = [s, score];
    }
    if (best) document.getElementById(`tile-${best}`)?.focus();
  };

  const tip = hover ? TILES[hover] : null;

  return (
    <div className="relative">
      <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="group" aria-label={label}>
        {STATE_CODES.map((s) => {
          const t = TILES[s];
          const x = t.col * (SIZE + GAP);
          const y = t.row * (SIZE + GAP);
          const shown = !revealed || revealed.has(s);
          const fill = shown ? fills[s] : undefined;
          const ink = fill?.ink === 'light' ? '#ffffff' : 'var(--color-ink)';
          const isSel = selected === s;
          return (
            <g
              key={s}
              id={`tile-${s}`}
              role="button"
              tabIndex={0}
              aria-label={describe(s)}
              aria-pressed={isSel}
              className="cursor-pointer outline-none [&:focus-visible>rect:last-of-type]:stroke-[var(--color-brass)]"
              onClick={() => onSelect?.(s)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelect?.(s);
                } else move(s, e);
              }}
              onPointerEnter={() => setHover(s)}
              onPointerLeave={() => setHover(null)}
              onFocus={() => setHover(s)}
              onBlur={() => setHover(null)}
            >
              <rect
                x={x}
                y={y}
                width={SIZE}
                height={SIZE}
                rx={6}
                fill={fill?.color ?? 'transparent'}
                stroke={fill ? 'rgba(20,33,61,0.18)' : 'var(--color-rule)'}
                strokeDasharray={fill ? undefined : '3 3'}
              />
              <text x={x + SIZE / 2} y={y + SIZE / 2 - 2} textAnchor="middle" fontSize={16} fontWeight={700} fill={fill ? ink : 'var(--color-ink-3)'}>
                {s}
              </text>
              <text x={x + SIZE / 2} y={y + SIZE / 2 + 15} textAnchor="middle" fontSize={11} fill={fill ? ink : 'var(--color-ink-3)'} opacity={0.85}>
                {STATES[s].electoralVotes}
              </text>
              {/* Focus / selection ring drawn last so it sits on top. */}
              <rect
                x={x - 2}
                y={y - 2}
                width={SIZE + 4}
                height={SIZE + 4}
                rx={8}
                fill="none"
                stroke={isSel ? 'var(--color-ink)' : 'transparent'}
                strokeWidth={2.5}
              />
            </g>
          );
        })}
      </svg>
      {hover && tip && (
        <div
          role="status"
          className={`pointer-events-none absolute z-10 w-56 rounded-md bg-ink px-3 py-2 text-xs leading-snug text-white shadow-lg ${
            tip.col <= 1 ? '' : tip.col >= TILE_COLS - 2 ? '-translate-x-full' : '-translate-x-1/2'
          }`}
          style={{
            // Anchor inward near the edges so the tooltip never gets squeezed.
            left: `${(((tip.col <= 1 ? tip.col * (SIZE + GAP) : tip.col >= TILE_COLS - 2 ? tip.col * (SIZE + GAP) + SIZE : tip.col * (SIZE + GAP) + SIZE / 2)) / W) * 100}%`,
            top: `${((tip.row * (SIZE + GAP) + SIZE + 8) / H) * 100}%`,
          }}
        >
          {describe(hover)}
        </div>
      )}
    </div>
  );
}
