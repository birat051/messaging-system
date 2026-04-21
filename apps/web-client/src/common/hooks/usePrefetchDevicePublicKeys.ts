import { useEffect } from 'react';
import { fetchDevicePublicKeys } from '@/modules/crypto/stores/devicePublicKeysSlice';
import { useAppDispatch } from '@/store/hooks';

/**
 * When **`recipientUserId`** changes (search pick or 1:1 thread), warm the **device** public-key cache for the peer
 * and **`me`** so the first hybrid send avoids a cold **`fetchDevicePublicKeys`** round-trip.
 */
export function usePrefetchDevicePublicKeys(
  recipientUserId: string | null | undefined,
): void {
  const dispatch = useAppDispatch();
  const id = recipientUserId?.trim() ?? '';

  useEffect(() => {
    if (!id) {
      return;
    }
    void dispatch(fetchDevicePublicKeys(id)).catch(() => {
      /* prefetch only */
    });
    void dispatch(fetchDevicePublicKeys('me')).catch(() => {
      /* prefetch only */
    });
  }, [dispatch, id]);
}
