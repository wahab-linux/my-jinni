const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  { ignores: ['node_modules/**', 'tmp/**', 'dist/**', '.venv/**'] },
  js.configs.recommended,
  {
    files: ['desktop/**/*.cjs', 'tests/desktop/**/*.cjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'commonjs', globals: globals.node },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }] }
  },
  {
    files: ['desktop/renderer/**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'script', globals: globals.browser },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }] }
  },
  {
    files: ['web/**/*.mjs', 'web/**/*.js'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: globals.browser },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }] }
  },
  {
    files: ['tests/web/**/*.mjs'],
    languageOptions: { ecmaVersion: 'latest', sourceType: 'module', globals: { ...globals.node, ...globals.browser } },
    rules: { 'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }] }
  }
];
