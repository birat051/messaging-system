import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import * as senderPlaintextLocalStore from '@/common/senderPlaintext/senderPlaintextLocalStore';
import {
  appendIncomingMessageIfNew,
  recordOwnSendPlaintext,
  replaceOptimisticMessage,
} from '@/modules/home/stores/messagingSlice';
import type { RootState } from './store';

/**
 * Write-through: when send-ack reducers set **`senderPlaintextByMessageId[messageId]`**, mirror to IndexedDB.
 * Reducers stay pure; persistence runs in this listener (**`replaceOptimisticMessage`**, **`appendIncomingMessageIfNew`**, **`recordOwnSendPlaintext`**).
 */
export const senderPlaintextPersistListener = createListenerMiddleware();

senderPlaintextPersistListener.startListening({
  matcher: isAnyOf(
    replaceOptimisticMessage,
    appendIncomingMessageIfNew,
    recordOwnSendPlaintext,
  ),
  effect: async (action, listenerApi) => {
    const state = listenerApi.getState() as RootState;
    const userId = state.auth.user?.id?.trim() ?? '';
    if (!userId) {
      return;
    }
    let messageId: string;
    if (recordOwnSendPlaintext.match(action)) {
      messageId = action.payload.messageId.trim();
    } else if (replaceOptimisticMessage.match(action)) {
      messageId = action.payload.message.id?.trim() ?? '';
    } else if (appendIncomingMessageIfNew.match(action)) {
      messageId = action.payload.message.id?.trim() ?? '';
    } else {
      return;
    }
    if (!messageId) {
      return;
    }
    const plain = state.messaging.senderPlaintextByMessageId[messageId];
    if (plain === undefined || plain === '') {
      return;
    }
    try {
      await senderPlaintextLocalStore.put(userId, messageId, plain);
    } catch {
      // IndexedDB failure — Redux still holds plaintext for this session.
    }
  },
});
