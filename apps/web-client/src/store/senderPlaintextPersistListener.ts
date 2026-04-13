import { createListenerMiddleware, isAnyOf } from '@reduxjs/toolkit';
import * as senderPlaintextLocalStore from '@/common/senderPlaintext/senderPlaintextLocalStore';
import type { Message } from '@/modules/home/stores/messagingSlice';
import {
  appendIncomingMessageIfNew,
  replaceOptimisticMessage,
} from '@/modules/home/stores/messagingSlice';
import type { RootState } from './store';

/**
 * Write-through: when send-ack reducers set **`senderPlaintextByMessageId[messageId]`**, mirror to IndexedDB.
 * Reducers stay pure; persistence runs in this listener (**`replaceOptimisticMessage`**, **`appendIncomingMessageIfNew`**).
 */
export const senderPlaintextPersistListener = createListenerMiddleware();

senderPlaintextPersistListener.startListening({
  matcher: isAnyOf(replaceOptimisticMessage, appendIncomingMessageIfNew),
  effect: async (action, listenerApi) => {
    const state = listenerApi.getState() as RootState;
    const userId = state.auth.user?.id?.trim() ?? '';
    if (!userId) {
      return;
    }
    let message: Message;
    if (replaceOptimisticMessage.match(action)) {
      ({ message } = action.payload);
    } else if (appendIncomingMessageIfNew.match(action)) {
      ({ message } = action.payload);
    } else {
      return;
    }
    const messageId = message.id?.trim() ?? '';
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
