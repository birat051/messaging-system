import eslint from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

// REST boundary: UI and app shell must not use httpClient / httpMutations / axios for REST — see src/common/api/README.md.
const REST_BOUNDARY_MESSAGE =
  'Import REST through `src/common/api` feature modules (`authApi`, `usersApi`, `API_PATHS`, `swrFetcher`, barrel `common/api/index.ts`) — not `httpClient`, `httpMutations`, or low-level `http*` helpers from the barrel.';

const REST_BARREL_IMPORT_NAMES = [
  'httpClient',
  'httpPost',
  'httpPut',
  'httpPatch',
  'httpDelete',
];

export default tseslint.config(
  {
    ignores: ['dist', 'node_modules', 'build', 'coverage', 'src/generated/**'],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: globals.browser,
    },
  },
  {
    files: ['src/workers/**/*.ts'],
    languageOptions: {
      globals: {
        ...globals.worker,
      },
    },
  },
  {
    files: ['vite.config.ts', 'tailwind.config.ts'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['eslint.config.mjs'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  // UI + app shell — not src/common/api (only REST transport). modules/**/utils/apiError.ts: axios for AxiosError only.
  {
    files: [
      'src/modules/**/*.{ts,tsx}',
      'src/common/components/**/*.{ts,tsx}',
      'src/common/hooks/**/*.{ts,tsx}',
      'src/common/utils/**/*.{ts,tsx}',
      'src/common/constants/**/*.{ts,tsx}',
      'src/common/types/**/*.{ts,tsx}',
      'src/common/realtime/**/*.{ts,tsx}',
      'src/common/theme/**/*.{ts,tsx}',
      'src/store/**/*.{ts,tsx}',
      'src/routes/**/*.{ts,tsx}',
      'src/common/integration/**/*.{ts,tsx}',
      'src/App.tsx',
    ],
    ignores: [
      '**/*.test.{ts,tsx}',
      '**/*.spec.{ts,tsx}',
      '**/*.d.ts',
      'src/modules/**/utils/apiError.ts',
    ],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          paths: [
            {
              name: '@/common/api',
              importNames: REST_BARREL_IMPORT_NAMES,
              message: REST_BOUNDARY_MESSAGE,
            },
          ],
          patterns: [
            {
              group: [
                '**/httpClient',
                '**/httpMutations',
                '@/common/api/httpClient',
                '@/common/api/httpMutations',
              ],
              message: REST_BOUNDARY_MESSAGE,
            },
            {
              regex:
                '^((\\.\\./)+common/api|\\.\\/common/api)(/index)?$',
              importNames: REST_BARREL_IMPORT_NAMES,
              message: REST_BOUNDARY_MESSAGE,
            },
            {
              group: ['axios'],
              message:
                'Use `src/common/api/*` for HTTP; `axios` is reserved for error helpers under `modules/auth/utils/apiError.ts` and `common/api/httpClient.ts`.',
            },
          ],
        },
      ],
    },
  },
  prettier,
);
