import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FlatCompat } from '@eslint/eslintrc';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const compat = new FlatCompat({ baseDirectory: __dirname });

const eslintConfig = [
  ...compat.extends('next/core-web-vitals', 'next/typescript'),
  {
    ignores: [
      'node_modules/**', 'out/**', 'build/**', 'coverage/**',
      'test-results/**', 'playwright-report/**', 'docs/**',
      'drizzle/**', 'next-env.d.ts', 'public/sw.js',
      // Next build output, including the per-slot e2e directories.
      '.next/**', '.next-e2e*/**',
      // Filesystem storage adapter content, including per-slot e2e data.
      '.data/**', '.data-test*/**',
    ],
  },
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
];

export default eslintConfig;
