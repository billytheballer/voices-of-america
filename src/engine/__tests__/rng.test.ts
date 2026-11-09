import { describe, expect, it } from 'vitest';
import { createRng, hashString } from '../rng';

describe('seeded RNG', () => {
  it('same seed → same sequence', () => {
    const a = createRng(42);
    const b = createRng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
  });

  it('different seeds diverge', () => {
    expect(createRng(1).next()).not.toBe(createRng(2).next());
  });

  it('stays in [0, 1)', () => {
    const r = createRng(7);
    for (let i = 0; i < 10_000; i++) {
      const x = r.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });

  it('can resume from a saved state', () => {
    const a = createRng(99);
    for (let i = 0; i < 17; i++) a.next();
    const b = createRng(a.state);
    for (let i = 0; i < 50; i++) expect(b.next()).toBe(a.next());
  });

  it('gaussian has mean ≈ 0 and sd ≈ 1', () => {
    const r = createRng(123);
    const n = 40_000;
    let sum = 0;
    let sq = 0;
    for (let i = 0; i < n; i++) {
      const g = r.gaussian();
      sum += g;
      sq += g * g;
    }
    const mean = sum / n;
    expect(Math.abs(mean)).toBeLessThan(0.02);
    expect(Math.abs(Math.sqrt(sq / n - mean * mean) - 1)).toBeLessThan(0.02);
  });

  it('int() is inclusive and covers the range', () => {
    const r = createRng(5);
    const seen = new Set<number>();
    for (let i = 0; i < 2_000; i++) seen.add(r.int(1, 6));
    expect([...seen].sort()).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it('weightedIndex respects weights and skips zeros', () => {
    const r = createRng(11);
    const counts = [0, 0, 0];
    for (let i = 0; i < 30_000; i++) counts[r.weightedIndex([1, 0, 3])]!++;
    expect(counts[1]).toBe(0);
    expect(Math.abs(counts[2]! / counts[0]! - 3)).toBeLessThan(0.2);
  });

  it('fork() gives deterministic, independent streams', () => {
    const a = createRng(1).fork('monte-carlo');
    const b = createRng(1).fork('monte-carlo');
    const c = createRng(1).fork('events');
    expect(a.next()).toBe(b.next());
    expect(createRng(1).fork('monte-carlo').next()).not.toBe(c.next());
  });

  it('hashString is stable', () => {
    expect(hashString('abc')).toBe(hashString('abc'));
    expect(hashString('abc')).not.toBe(hashString('abd'));
  });
});
