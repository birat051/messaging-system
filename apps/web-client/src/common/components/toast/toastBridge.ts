import type { ToastApi } from './types';

let bridge: ToastApi | null = null;

/** Called from **`ToastProvider`** so **`httpClient`** can show **429** toasts without React hooks. */
export function setToastBridge(next: ToastApi | null): void {
  bridge = next;
}

export function getToastBridge(): ToastApi | null {
  return bridge;
}
