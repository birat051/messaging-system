import { useSyncExternalStore } from 'react';

function subscribe(onStoreChange: () => void): () => void {
  document.addEventListener('visibilitychange', onStoreChange);
  return () => {
    document.removeEventListener('visibilitychange', onStoreChange);
  };
}

function getSnapshot(): boolean {
  return document.visibilityState === 'visible';
}

function getServerSnapshot(): boolean {
  return true;
}

/**
 * **`true`** when **`document.visibilityState === 'visible'`** (tab in foreground).
 */
export function useDocumentVisibilityVisible(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}
