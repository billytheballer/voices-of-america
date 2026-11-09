/**
 * Seeded, serializable PRNG (mulberry32). The only source of randomness the
 * engine is allowed to use (ESLint bans Math.random in src/engine).
 *
 * The full generator state is a single uint32, so a save file can capture it
 * and replays are bit-identical.
 */
export interface Rng {
  /** Uniform float in [0, 1). */
  next(): number;
  /** Standard normal N(0, 1) via Box–Muller. */
  gaussian(): number;
  /** Normal with given mean and standard deviation. */
  normal(mean: number, sd: number): number;
  /** Integer in [min, max], inclusive. */
  int(min: number, max: number): number;
  /** Picks an index with probability proportional to its weight. */
  weightedIndex(weights: readonly number[]): number;
  /** Independent child stream (e.g. one per Monte Carlo worker or subsystem). */
  fork(label: string): Rng;
  /** Current internal state, for saving. */
  readonly state: number;
}

export function createRng(seed: number): Rng {
  let s = seed >>> 0;
  let spareGaussian: number | null = null;

  const next = () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  const gaussian = () => {
    if (spareGaussian !== null) {
      const g = spareGaussian;
      spareGaussian = null;
      return g;
    }
    let u = 0;
    while (u === 0) u = next(); // avoid log(0)
    const v = next();
    const mag = Math.sqrt(-2 * Math.log(u));
    spareGaussian = mag * Math.sin(2 * Math.PI * v);
    return mag * Math.cos(2 * Math.PI * v);
  };

  return {
    next,
    gaussian,
    normal: (mean, sd) => mean + sd * gaussian(),
    int: (min, max) => min + Math.floor(next() * (max - min + 1)),
    weightedIndex(weights) {
      const total = weights.reduce((a, w) => a + Math.max(0, w), 0);
      if (total <= 0) throw new Error('weightedIndex: all weights are zero');
      let r = next() * total;
      for (let i = 0; i < weights.length; i++) {
        r -= Math.max(0, weights[i]!);
        if (r < 0) return i;
      }
      return weights.length - 1;
    },
    fork: (label) => createRng(hashString(`${s}:${label}`)),
    get state() {
      return s;
    },
  };
}

/** FNV-1a 32-bit hash: turns labels / seeds into uint32 seeds. */
export function hashString(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
