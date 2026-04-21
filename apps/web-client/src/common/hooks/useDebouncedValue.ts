import { useEffect, useState } from 'react';

/**
 * Debounces **`value`** updates — use for search fields to avoid a request on every keystroke.
 */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    // Clearing the field should drop debounced state immediately (e.g. search reset after navigation).
    if (typeof value === 'string' && value === '') {
      setDebounced(value);
      return;
    }
    const id = window.setTimeout(() => {
      setDebounced(value);
    }, delayMs);
    return () => window.clearTimeout(id);
  }, [value, delayMs]);

  return debounced;
}
