import { createMockProvider, createProxyProvider, withCache } from './providers';
import type { LLMProvider } from './types';

export * from './types';
export { createMockProvider, createProxyProvider, withCache };

let instance: LLMProvider | null = null;

/**
 * App-wide provider, chosen at build time:
 *   VITE_LLM_MODE=mock  (default) offline heuristics, no key, free
 *   VITE_LLM_MODE=proxy calls /api/*, which calls Anthropic server-side
 */
export function getLLMProvider(): LLMProvider {
  if (!instance) {
    const mode = import.meta.env?.VITE_LLM_MODE === 'proxy' ? 'proxy' : 'mock';
    instance = withCache(mode === 'proxy' ? createProxyProvider() : createMockProvider());
  }
  return instance;
}
