import { useCallback, useEffect, useMemo } from 'react';
import type { HybridDeviceRow } from '@/common/crypto/messageHybrid';
import {
  DEVICE_PUBLIC_KEYS_CACHE_TTL_MS,
  fetchDevicePublicKeys,
  invalidateDevicePublicKeys,
  isDevicePublicKeysCacheFresh,
  selectDevicePublicKeysEntry,
} from '@/modules/crypto/stores/devicePublicKeysSlice';
import { useAppDispatch, useAppSelector } from '@/store/hooks';

export type UseDevicePublicKeysResult = {
  /** Normalized cache key (trimmed **`userId`**, or **`''`** when disabled). */
  cacheKey: string;
  items: HybridDeviceRow[];
  forbidden: boolean;
  loading: boolean;
  error: string | null;
  /** True when cache is warm within **`DEVICE_PUBLIC_KEYS_CACHE_TTL_MS`**. */
  isFresh: boolean;
  /** Clears Redux cache for this user then refetches. */
  refresh: () => void;
};

/**
 * Cached **`GET /users/:userId/devices/public-keys`** (including **`'me'`**) in Redux — avoids refetching
 * on every **`message:send`**. TTL: **`DEVICE_PUBLIC_KEYS_CACHE_TTL_MS`**.
 */
export function useDevicePublicKeys(
  userId: string | null | undefined,
): UseDevicePublicKeysResult {
  const dispatch = useAppDispatch();
  const cacheKey = useMemo(() => userId?.trim() ?? '', [userId]);

  const entry = useAppSelector((s) =>
    cacheKey ? selectDevicePublicKeysEntry(s, cacheKey) : undefined,
  );

  const isFresh = isDevicePublicKeysCacheFresh(entry);

  useEffect(() => {
    if (!cacheKey) {
      return;
    }
    if (isDevicePublicKeysCacheFresh(entry)) {
      return;
    }
    if (entry?.status === 'loading') {
      return;
    }
    void dispatch(fetchDevicePublicKeys(cacheKey));
  }, [cacheKey, dispatch, entry]);

  const refresh = useCallback(() => {
    if (!cacheKey) {
      return;
    }
    dispatch(invalidateDevicePublicKeys(cacheKey));
    void dispatch(fetchDevicePublicKeys(cacheKey));
  }, [cacheKey, dispatch]);

  return {
    cacheKey,
    items: entry?.items ?? [],
    forbidden: entry?.forbidden ?? false,
    loading: entry?.status === 'loading',
    error: entry?.error ?? null,
    isFresh,
    refresh,
  };
}

export { DEVICE_PUBLIC_KEYS_CACHE_TTL_MS };
