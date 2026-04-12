import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/**/*.test.ts'],
    /** Integration tests need Docker services; run via `npm run test:integration`. */
    exclude: ['**/node_modules/**', 'src/integration/**'],
  },
});
