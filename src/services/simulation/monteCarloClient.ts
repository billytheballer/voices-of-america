import { runMonteCarlo } from '@/engine/simulation/monteCarlo';
import type { WorkerRequest, WorkerResponse } from '@/engine/simulation/protocol';
import type { MonteCarloResult, MonteCarloSnapshot, SimulationInput } from '@/engine/simulation/types';

export interface RunHandle {
  promise: Promise<{ result: MonteCarloResult; elapsedMs: number }>;
  cancel: () => void;
}

export class SimulationCancelledError extends Error {
  constructor() {
    super('Simulation cancelled');
    this.name = 'SimulationCancelledError';
  }
}

let worker: Worker | null = null;
let jobCounter = 0;

/** Single-file previews can't load a separate worker script; they set this to run inline. */
const WORKERS_DISABLED = import.meta.env?.VITE_DISABLE_WORKER === 'true';

function getWorker(): Worker | null {
  if (WORKERS_DISABLED || typeof Worker === 'undefined') return null;
  worker ??= new Worker(new URL('../../engine/simulation/monteCarlo.worker.ts', import.meta.url), {
    type: 'module',
  });
  return worker;
}

/**
 * Runs the Monte Carlo in a Web Worker, streaming snapshots to `onProgress`.
 * Falls back to a synchronous main-thread run where Workers don't exist
 * (SSR, some test runners).
 */
export function runSimulation(input: SimulationInput, onProgress?: (s: MonteCarloSnapshot) => void): RunHandle {
  const w = getWorker();
  if (!w) {
    const started = performance.now();
    const result = runMonteCarlo(input);
    return { promise: Promise.resolve({ result, elapsedMs: performance.now() - started }), cancel: () => {} };
  }

  const jobId = `mc-${++jobCounter}`;
  let cleanup = () => {};
  const promise = new Promise<{ result: MonteCarloResult; elapsedMs: number }>((resolve, reject) => {
    const onMessage = (e: MessageEvent<WorkerResponse>) => {
      const msg = e.data;
      if (msg.jobId !== jobId) return;
      switch (msg.type) {
        case 'progress':
          onProgress?.(msg.snapshot);
          break;
        case 'done':
          cleanup();
          resolve({ result: msg.result, elapsedMs: msg.elapsedMs });
          break;
        case 'cancelled':
          cleanup();
          reject(new SimulationCancelledError());
          break;
        case 'error':
          cleanup();
          reject(new Error(msg.message));
          break;
      }
    };
    w.addEventListener('message', onMessage);
    cleanup = () => w.removeEventListener('message', onMessage);
    w.postMessage({ type: 'run', jobId, input } satisfies WorkerRequest);
  });

  return { promise, cancel: () => w.postMessage({ type: 'cancel', jobId } satisfies WorkerRequest) };
}
