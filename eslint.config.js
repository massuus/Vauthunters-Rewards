import js from '@eslint/js';
import globals from 'globals';

const baseRules = {
  'no-console': ['warn', { allow: ['warn', 'error'] }],
  'no-unused-vars': ['warn', { argsIgnorePattern: '^_', ignoreRestSiblings: true }],
  'no-var': 'error',
  'prefer-const': 'error',
  'prefer-arrow-callback': 'warn',
  eqeqeq: ['error', 'always'],
  'no-eval': 'error',
  'no-implied-eval': 'error',
  'no-with': 'error',
  'prefer-template': 'warn',
};

export default [
  {
    ignores: [
      'node_modules/**',
      'dist/**',
      'build/**',
      'coverage/**',
      '.wrangler/**',
      '.git/**',
      'public/data/**',
      'public/css/**',
      'public/img/**',
      'public/pages/**',
      'public/templates/**',
      'public/_routes.json',
      'public/_headers',
    ],
  },
  {
    ...js.configs.recommended,
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
    },
    rules: baseRules,
  },
  {
    files: ['functions/**/*.js', 'build.js'],
    languageOptions: {
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    rules: {
      ...baseRules,
      'no-console': 'off',
    },
  },
  {
    files: ['public/sw.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        ...globals.es2022,
      },
    },
    rules: {
      ...baseRules,
      'no-console': 'off',
    },
  },
];
