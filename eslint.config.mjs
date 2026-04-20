import tsParser from '@typescript-eslint/parser'

export default [
  {
    ignores: [
      '.next/**',
      'node_modules/**',
      'data/**',
      'public/**',
      'package-lock.json',
      'pnpm-lock.yaml',
      'yarn.lock',
      'next-env.d.ts',
      'tsconfig.tsbuildinfo',
    ],
  },
  {
    files: ['**/*.{js,mjs,cjs,ts,tsx}'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        ecmaFeatures: {
          jsx: true,
        },
      },
    },
    rules: {},
  },
]
