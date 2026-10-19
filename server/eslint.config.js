// @ts-check
const js = require('@eslint/js');
const globals = require('globals');
const tseslint = require('typescript-eslint');
const { defineConfig, globalIgnores } = require('eslint/config');

module.exports = defineConfig([
  globalIgnores(['dist', 'node_modules', 'uploads', 'backups', 'prisma/generated', 'src/generated']),
  {
    files: ['**/*.{ts,js}'],
    extends: [js.configs.recommended, tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.node,
    },
    rules: {
      // Underscore prefix marks intentionally unused bindings (same convention as the client).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_', ignoreRestSiblings: true },
      ],
    },
  },
  {
    // This config file itself is CommonJS (the package is "type": "commonjs").
    files: ['eslint.config.js'],
    rules: { '@typescript-eslint/no-require-imports': 'off' },
  },
  {
    // Tests and fixtures legitimately use loose types for mocks.
    files: ['**/*.{test,spec}.ts', '**/__tests__/**/*.ts', 'src/test/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
]);
