module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'jest', 'eslint-plugin-tsdoc'],
  extends: [
    'standard-with-typescript',
    'prettier',
    'plugin:jest/recommended',
    'plugin:import/errors',
    'plugin:import/typescript'
  ],
  parserOptions: {
    tsconfigRootDir: __dirname,
    project: ['./tsconfig.eslint.json']
  },
  rules: {
    'tsdoc/syntax': 'warn',
    'no-new': 'off',
    '@typescript-eslint/no-extraneous-class': 'warn'
  }
};
