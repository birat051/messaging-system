import { listMyDevices, listMySyncMessageKeys } from '@/common/api/usersApi';
import {
  setSyncState,
  type CryptoState,
  type CryptoSyncState,
} from '@/modules/crypto/stores/cryptoSlice';
import type { AppDispatch } from '@/store/store';

export type EvaluateDeviceSyncBootstrapOptions = {
  /** Read current **`syncState`** before updating (so **`pending`** / **`in_progress`** can become **`complete`** when keys appear, without forcing **`idle`** users into **`complete`**). */
  getState?: () => Pick<CryptoState, 'syncState'>;
  /** After keys exist for this device, revalidate conversation message caches so history can decrypt. */
  onHistoryMayDecryptNow?: () => void;
};

/** True when **`encryptedMessageKeys[deviceId]`** is a non-empty wrapped-key string (hybrid E2EE). */
export function messageHasDeviceWrappedKey(
  message: { encryptedMessageKeys?: Record<string, string> | null },
  deviceId: string,
): boolean {
  const k = deviceId.trim();
  if (k.length === 0) {
    return false;
  }
  const v = message.encryptedMessageKeys?.[k];
  return typeof v === 'string' && v.trim().length > 0;
}

/**
 * After **`POST /v1/users/me/devices`** (or session restore once **`deviceId`** is known), classify whether this
 * browser is a **new device awaiting multi-device key sync**: another registered device may hold wrapped keys
 * this **`deviceId`** does not have yet.
 *
 * **Heuristic:** if **`GET /v1/users/me/devices`** lists **more than one** device and **`GET /v1/users/me/sync/message-keys`**
 * (first page, **`limit: 1`**) returns **no** wrapped keys for **`deviceId`**, set **`syncState: 'pending'`**; otherwise **`idle`**
 * (or **`complete`** when **`getState`** shows we were **`pending`** or **`in_progress`** — post trusted-device sync).
 * While **`in_progress`** and keys are not visible yet, state stays **`in_progress`** (does not revert to **`pending`**).
 * (Single-device accounts or any wrapped key present → **`idle`** or **`complete`**.) Failures fall back to **`idle`** so bootstrap never blocks sign-in.
 */
export async function evaluateDeviceSyncBootstrapState(
  dispatch: AppDispatch,
  deviceId: string,
  options?: EvaluateDeviceSyncBootstrapOptions,
): Promise<CryptoSyncState> {
  const trimmed = deviceId.trim();
  if (trimmed.length === 0) {
    dispatch(setSyncState('idle'));
    return 'idle';
  }
  try {
    const priorSyncState = options?.getState?.().syncState;
    const wasAwaitingTrustedSync =
      priorSyncState === 'pending' || priorSyncState === 'in_progress';

    const devices = await listMyDevices();
    if (devices.items.length <= 1) {
      dispatch(setSyncState('idle'));
      return 'idle';
    }
    const sync = await listMySyncMessageKeys({ deviceId: trimmed, limit: 1 });
    const hasWrappedKeyForDevice =
      sync.items.length > 0 || sync.hasMore === true;
    let next: CryptoSyncState;
    if (hasWrappedKeyForDevice) {
      if (wasAwaitingTrustedSync) {
        next = 'complete';
        dispatch(setSyncState('complete'));
        options?.onHistoryMayDecryptNow?.();
      } else {
        next = 'idle';
        dispatch(setSyncState('idle'));
      }
    } else {
      if (priorSyncState === 'in_progress') {
        next = 'in_progress';
        dispatch(setSyncState('in_progress'));
      } else {
        next = 'pending';
        dispatch(setSyncState('pending'));
      }
    }
    return next;
  } catch {
    dispatch(setSyncState('idle'));
    return 'idle';
  }
}
