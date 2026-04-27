/**
 * @file Re-exports the configured Redux store so `import { store } from '@/store'`
 * and `import { store } from './store'` (from `src/`) keep working.
 */
export { store, type RootState, type AppDispatch } from './store.ts';
