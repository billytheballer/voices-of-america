/** Minimal key–value storage, so persistence can be tested without a browser. */
export interface StorageAdapter {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
  keys(): string[];
}

/** Storage can be missing or throw (private mode, sandboxed frames): degrade to "no saves". */
const attempt = <T>(fn: () => T, fallback: T): T => {
  try {
    return fn();
  } catch {
    return fallback;
  }
};

export const localStorageAdapter: StorageAdapter = {
  get: (k) => attempt(() => localStorage.getItem(k), null),
  set: (k, v) => attempt(() => localStorage.setItem(k, v), undefined),
  remove: (k) => attempt(() => localStorage.removeItem(k), undefined),
  keys: () => attempt(() => Array.from({ length: localStorage.length }, (_, i) => localStorage.key(i)!).filter(Boolean), []),
};

export function createMemoryAdapter(): StorageAdapter {
  const m = new Map<string, string>();
  return {
    get: (k) => m.get(k) ?? null,
    set: (k, v) => void m.set(k, v),
    remove: (k) => void m.delete(k),
    keys: () => [...m.keys()],
  };
}
