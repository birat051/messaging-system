import { PEER_DECRYPT_NO_DEVICE_KEY_ENTRY } from '@/modules/home/utils/peerDecryptInline';

/**
 * **`usePeerMessageDecryption`** normally skips rows already in **`decryptedBodyByMessageId`**.
 * Hybrid rows that failed with **no local `deviceId` / key slot** may succeed after **`registerDevice`**
 * or **`hydrateMessagingDeviceId`** — allow a re-attempt in that case only.
 */
export function shouldRetryPeerDecryptAfterCachedFailure(
  cachedPlaintext: string | undefined,
): boolean {
  return (
    cachedPlaintext === undefined ||
    cachedPlaintext === PEER_DECRYPT_NO_DEVICE_KEY_ENTRY
  );
}
