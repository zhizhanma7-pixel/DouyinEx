export default [
  { ignores: ['dist/**'] },
  {
    linterOptions: { reportUnusedDisableDirectives: 'error' },
    rules: {
      'no-constant-condition': 'error',
      'no-debugger': 'error',
      'no-dupe-keys': 'error',
      'no-redeclare': 'error',
      'no-unreachable': 'error',
      'no-unused-vars': 'error',
      eqeqeq: 'error',
      'prefer-const': 'error',
    },
  },
]
