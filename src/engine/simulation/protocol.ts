import type { MonteCarloResult, MonteCarloSnapshot, SimulationInput } from './types';

/** Main thread → worker */
export type WorkerRequest =
  | { type: 'run'; jobId: string; input: SimulationInput }
  | { type: 'cancel'; jobId: string };

/** Worker → main thread */
export type WorkerResponse =
  | { type: 'progress'; jobId: string; snapshot: MonteCarloSnapshot }
  | { type: 'done'; jobId: string; result: MonteCarloResult; elapsedMs: number }
  | { type: 'cancelled'; jobId: string }
  | { type: 'error'; jobId: string; message: string };
