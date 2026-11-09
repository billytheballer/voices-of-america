import { useCallback, useEffect, useRef, useState } from 'react';
import type { MonteCarloResult, MonteCarloSnapshot, SimulationInput } from '@/engine/simulation/types';
import { runSimulation, SimulationCancelledError, type RunHandle } from '@/services/simulation/monteCarloClient';

export type MonteCarloStatus = 'idle' | 'running' | 'done' | 'error';

/**
 * React wrapper around the worker client. Starting a new run cancels any run
 * in flight; unmounting cancels too.
 */
export function useMonteCarlo() {
  const [status, setStatus] = useState<MonteCarloStatus>('idle');
  const [progress, setProgress] = useState<MonteCarloSnapshot | null>(null);
  const [result, setResult] = useState<MonteCarloResult | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const handle = useRef<RunHandle | null>(null);

  const run = useCallback((input: SimulationInput) => {
    handle.current?.cancel();
    setStatus('running');
    setProgress(null);
    setError(null);
    const h = runSimulation(input, setProgress);
    handle.current = h;
    h.promise
      .then(({ result: r, elapsedMs: ms }) => {
        if (handle.current !== h) return;
        setResult(r);
        setElapsedMs(ms);
        setStatus('done');
      })
      .catch((err: unknown) => {
        if (err instanceof SimulationCancelledError || handle.current !== h) return;
        setError(err instanceof Error ? err.message : String(err));
        setStatus('error');
      });
  }, []);

  useEffect(() => () => handle.current?.cancel(), []);

  return { status, progress, result, elapsedMs, error, run };
}
