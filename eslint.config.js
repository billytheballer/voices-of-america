import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', '.vercel'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.strict],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Non-null assertions are used deliberately where an index is known valid (noUncheckedIndexedAccess is on).
      '@typescript-eslint/no-non-null-assertion': 'off',
      // The JSON Schema converter deletes keys by name on its own copy.
      '@typescript-eslint/no-dynamic-delete': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_', destructuredArrayIgnorePattern: '^_' }],
    },
  },
  {
    // The engine must stay pure: no React, no network, no wall-clock, no Math.random.
    files: ['src/engine/**/*.ts', 'src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        { patterns: ['react', 'react-dom', 'zustand', '@/services/*', '@/store/*', '@/features/*'] },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG in engine/rng.ts.' },
        { object: 'Date', property: 'now', message: 'Engine time comes from game state, not the clock.' },
      ],
      'no-restricted-globals': ['error', 'fetch', 'localStorage'],
    },
  },
);
