import type { AppDispatch } from '@/store/store';
import { hydrateSenderPlaintextFromDisk } from '@/modules/home/stores/messagingSlice';
import * as senderPlaintextLocalStore from './senderPlaintextLocalStore';

/**
 * After **`user.id`** is known (session restore or fresh login), loads persisted sender plaintext from
 * IndexedDB and merges into **`senderPlaintextByMessageId`** so **`hydrateMessagesFromFetch`** runs on a
 * populated map. Safe if the store is empty or IndexedDB fails (session stays usable).
 */
export async function loadSenderPlaintextIntoRedux(
  dispatch: AppDispatch,
  userId: string,
): Promise<void> {
  const uid = userId.trim();
  if (!uid) {
    return;
  }
  try {
    const map = await senderPlaintextLocalStore.getAll(uid);
    if (Object.keys(map).length === 0) {
      return;
    }
    dispatch(hydrateSenderPlaintextFromDisk(map));
  } catch {
    // Missing/broken IndexedDB — no persisted plaintext; messaging still works for new sends.
  }
}
