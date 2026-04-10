import { useCallback, useLayoutEffect, useMemo, useState, type ReactNode } from 'react';
import { ToastContext } from './toastContext';
import { setToastBridge } from './toastBridge';
import type { ToastApi, ToastVariant } from './types';

const TOAST_MS = 4500;

type ToastItem = { id: string; variant: ToastVariant; message: string };

function toastSurfaceClass(variant: ToastVariant): string {
  switch (variant) {
    case 'success':
      return 'border-emerald-500/40 bg-emerald-950/90 text-emerald-50 dark:bg-emerald-950/80';
    case 'error':
      return 'border-red-500/40 bg-red-950/90 text-red-50 dark:bg-red-950/80';
    case 'warning':
      return 'border-amber-500/40 bg-amber-950/90 text-amber-50 dark:bg-amber-950/80';
    default:
      return 'border-border bg-surface text-foreground shadow-card';
  }
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const push = useCallback(
    (message: string, variant: ToastVariant) => {
      const id =
        typeof crypto !== 'undefined' && 'randomUUID' in crypto
          ? crypto.randomUUID()
          : String(Date.now());
      setToasts((t) => [...t, { id, variant, message }]);
      window.setTimeout(() => {
        dismiss(id);
      }, TOAST_MS);
    },
    [dismiss],
  );

  const value = useMemo<ToastApi>(
    () => ({
      success: (m) => push(m, 'success'),
      error: (m) => push(m, 'error'),
      info: (m) => push(m, 'info'),
      warning: (m) => push(m, 'warning'),
    }),
    [push],
  );

  useLayoutEffect(() => {
    setToastBridge(value);
    return () => {
      setToastBridge(null);
    };
  }, [value]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-label="Notifications"
        className="fixed right-4 bottom-4 z-50 flex max-w-sm flex-col gap-2"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            data-testid="toast"
            className={`rounded-md border px-4 py-3 text-sm shadow-lg backdrop-blur-sm ${toastSurfaceClass(t.variant)}`}
          >
            {t.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
