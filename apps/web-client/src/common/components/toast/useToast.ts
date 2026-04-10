import { useContext } from 'react';
import { ToastContext } from './toastContext';
import type { ToastApi } from './types';

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) {
    throw new Error('useToast must be used within ToastProvider');
  }
  return ctx;
}
