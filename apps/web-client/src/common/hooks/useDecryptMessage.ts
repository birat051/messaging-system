import { useCallback } from 'react';
import {
  decryptHybridMessageToUtf8,
  type HybridDecryptDebugMeta,
} from '@/common/crypto/messageHybrid';
import { getStoredDeviceId } from '@/common/crypto/privateKeyStorage';
import { loadMessagingEcdhPrivateKey } from '@/common/crypto/loadMessagingEcdhPrivateKey';

export type HybridMessageWire = {
  body: string;
  iv: string;
  encryptedMessageKeys: Record<string, string>;
  /** Optional — forwarded as **`HybridDecryptDebugMeta`** for **`decryptHybridMessageToUtf8`** (**`vite dev`** traces). */
  debugMeta?: HybridDecryptDebugMeta;
};

/**
 * Hybrid receive: **`encryptedMessageKeys[storedDeviceId]`** → **`unwrapMessageKey`** → **`decryptMessageBody`**.
 * **Inbound thread UI** uses **`usePeerMessageDecryption`** (same crypto stack). See **`e2eeInboundDecryptTrace.ts`**.
 */
export function useDecryptMessage(): {
  decryptHybridForStoredDevice: (
    userId: string,
    message: HybridMessageWire,
  ) => Promise<string>;
} {
  const decryptHybridForStoredDevice = useCallback(
    async (userId: string, message: HybridMessageWire): Promise<string> => {
      const uid = userId.trim();
      if (!uid) {
        throw new Error('userId is required');
      }
      const deviceId = await getStoredDeviceId(uid);
      if (!deviceId?.trim()) {
        throw new Error('No deviceId stored for this browser');
      }
      const pk = await loadMessagingEcdhPrivateKey(uid);
      if (!pk) {
        throw new Error('Encryption private key is not available');
      }
      return decryptHybridMessageToUtf8(
        {
          body: message.body,
          iv: message.iv,
          encryptedMessageKeys: message.encryptedMessageKeys,
        },
        deviceId.trim(),
        pk,
        message.debugMeta,
      );
    },
    [],
  );

  return { decryptHybridForStoredDevice };
}
