import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'node_modules',
      'build',
      'src/generated/api-types.ts',
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
);
