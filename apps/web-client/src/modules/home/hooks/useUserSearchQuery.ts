import { useCallback, useState } from 'react';
import useSWR from 'swr';
import { searchUsers } from '@/common/api/usersApi';
import { useDebouncedValue } from '@/common/hooks/useDebouncedValue';
import { isValidUserSearchQuery } from '@/common/utils/formValidation';
import { parseApiError } from '@/modules/auth/utils/apiError';

/** Pause between keystrokes before calling **`GET /users/search`**. */
export const SEARCH_DEBOUNCE_MS = 400;

export function useUserSearchQuery() {
  const [query, setQuery] = useState('');

  const debouncedTrimmed = useDebouncedValue(query.trim(), SEARCH_DEBOUNCE_MS);
  const normalizedQuery = debouncedTrimmed.toLowerCase();
  const canSearch = isValidUserSearchQuery(normalizedQuery);

  const { data, error, isLoading, isValidating } = useSWR(
    canSearch ? (['users-search', normalizedQuery] as const) : null,
    ([, q]) => searchUsers({ query: q }),
    { revalidateOnFocus: false },
  );

  const showLoading = canSearch && (isLoading || isValidating);
  const parsedError = error ? parseApiError(error) : null;

  const resetSearch = useCallback((): void => {
    setQuery('');
  }, []);

  return {
    query,
    setQuery,
    debouncedTrimmed,
    normalizedQuery,
    canSearch,
    data,
    error,
    isLoading,
    isValidating,
    showLoading,
    parsedError,
    resetSearch,
  };
}
