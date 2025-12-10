import globals from 'globals';
import pluginVue from 'eslint-plugin-vue';
import eslintConfigPrettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      'dist',
      'out',
      'node_modules',
      'coverage',
      '.vite',
      'release',
      '.cache',
      'dist-server',
      'dist-web',
    ],
  },
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
        ...globals.es2021,
      },
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
  },
  ...tseslint.configs.recommended,
  ...pluginVue.configs['flat/recommended'],
  {
    files: ['*.vue', '**/*.vue'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
      },
    },
  },
  eslintConfigPrettier,
  {
    rules: {
      'vue/multi-word-component-names': 'off',
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'warn',
    },
  },
  {
    files: ['**/*.test.ts', '**/*.test.js', 'tests/**/*.ts', 'tests/**/*.js'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
];
