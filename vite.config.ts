/// <reference types="vitest/config" />
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';
import { llmDevApi } from './api/_lib/devPlugin';

export default defineConfig(({ mode }) => ({
  // Server-only env (no VITE_ prefix) is read here and never reaches the browser bundle.
  plugins: [react(), tailwindcss(), llmDevApi(loadEnv(mode, process.cwd(), ''))],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  worker: {
    format: 'es', // Monte Carlo runs in an ES-module Web Worker (Stage 5)
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx', 'api/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/engine/**', 'src/domain/**'],
      // Raise these once you've seen the first real coverage report.
      thresholds: { lines: 80, functions: 80, branches: 70 },
    },
  },
}));
