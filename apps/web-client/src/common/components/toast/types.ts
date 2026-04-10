export type ToastVariant = 'success' | 'error' | 'info' | 'warning';

export type ToastApi = {
  success: (message: string) => void;
  error: (message: string) => void;
  info: (message: string) => void;
  /** Rate limits (**429**) — distinct from **`error`** (see **`ToastProvider`** surface). */
  warning: (message: string) => void;
};
