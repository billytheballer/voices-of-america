/// <reference lib="webworker" />
import { runMonteCarloChunked } from './monteCarlo';
import type { WorkerRequest, WorkerResponse } from './protocol';

/**
 * Thin Web Worker shell around the pure chunked runner. Keeps 10k runs off
 * the main thread so the map animates at 60 fps while results stream in.
 */
declare const self: DedicatedWorkerGlobalScope;

const cancelled = new Set<string>();
const post = (msg: WorkerResponse) => self.postMessage(msg);
/** Yield to the event loop so 'cancel' messages can be processed between chunks. */
const yieldToEventLoop = () => new Promise<void>((resolve) => setTimeout(resolve, 0));

self.onmessage = async (e: MessageEvent<WorkerRequest>) => {
  const msg = e.data;
  if (msg.type === 'cancel') {
    cancelled.add(msg.jobId);
    return;
  }

  const { jobId, input } = msg;
  const started = performance.now();
  try {
    const gen = runMonteCarloChunked(input);
    for (;;) {
      const step = await gen.next();
      if (cancelled.has(jobId)) {
        cancelled.delete(jobId);
        post({ type: 'cancelled', jobId });
        return;
      }
      if (step.done) {
        post({ type: 'done', jobId, result: step.value, elapsedMs: performance.now() - started });
        return;
      }
      post({ type: 'progress', jobId, snapshot: step.value });
      await yieldToEventLoop();
    }
  } catch (err) {
    post({ type: 'error', jobId, message: err instanceof Error ? err.message : String(err) });
  }
};
