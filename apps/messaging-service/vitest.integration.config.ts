import { defineConfig } from 'vitest/config';

/** `npm run test:integration` — see `src/integration/messagingSocket.integration.test.ts`. */
export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    include: ['src/integration/**/*.test.ts'],
    pool: 'forks',
    poolOptions: {
      forks: { singleFork: true },
    },
  },
});
