import { useCallback } from 'react';
import {
  encryptUtf8ToHybridSendPayload,
  type HybridDeviceRow,
} from '@/common/crypto/messageHybrid';

export type HybridSendPayload = Awaited<
  ReturnType<typeof encryptUtf8ToHybridSendPayload>
>;

/**
 * **`generateMessageKey`** → **`encryptMessageBody`** → **`wrapMessageKey`** per device (via
 * **`encryptUtf8ToHybridSendPayload`**). Pass **`devices`** from **`mergeHybridDeviceRows`** +
 * **`useDevicePublicKeys`** / Redux cache.
 */
export function useEncryptMessage(): {
  encryptUtf8Hybrid: (
    plaintext: string,
    devices: HybridDeviceRow[],
  ) => Promise<HybridSendPayload>;
} {
  const encryptUtf8Hybrid = useCallback(
    (plaintext: string, devices: HybridDeviceRow[]) =>
      encryptUtf8ToHybridSendPayload(plaintext, devices),
    [],
  );

  return { encryptUtf8Hybrid };
}
