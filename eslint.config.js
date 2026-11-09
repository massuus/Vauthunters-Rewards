import js from '@eslint/js';
import globals from 'globals';

const baseRules = {
  'no-empty': ['error', { allowEmptyCatch: true }],
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
      'dist-test/**',
      'build/**',
      'coverage/**',
      '.wrangler/**',
      '**/.wrangler/**',
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
    rules: {
      ...js.configs.recommended.rules,
      ...baseRules,
    },
  },
  {
    files: ['functions/**/*.js', 'workers/**/*.js', 'build.js'],
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
    files: ['scripts/**/*.{js,mjs}', 'tests/**/*.{js,mjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['public/sw.js'],
    languageOptions: {
      globals: {
        ...globals.serviceworker,
        ...globals.es2022,
        __BUILD_REV__: 'readonly',
        __PRECACHE_ASSETS__: 'readonly',
      },
    },
    rules: {
      ...baseRules,
      'no-console': 'off',
    },
  },
];
