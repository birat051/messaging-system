import { createListenerMiddleware } from '@reduxjs/toolkit';
import {
  appendIncomingMessageIfNew,
  replaceOptimisticMessage,
  setConversationScrollTarget,
} from '@/modules/home/stores/messagingSlice';

/**
 * **§6 scroll target writers** (see **`docs/TASK_CHECKLIST.md`** §6.2):
 *
 * - **`message:new`:** after **`appendIncomingMessageIfNew`** actually inserts a row (not a dedupe no-op),
 *   **`reason: 'message_new'`**.
 * - **Send ack:** after **`replaceOptimisticMessage`** (**`message:send`** ack merged into the list),
 *   **`reason: 'send_ack'`** with the server **`Message.id`**.
 *
 * **Inbound scope:** target is set **whenever** the inbound message is newly merged, **independent of**
 * **`activeConversationId`**, so opening the conversation later still has a pending **`messageId`** to scroll to
 * (latest **`message:new` per thread overwrites** via **`setConversationScrollTarget`**).
 */
export const conversationScrollOnMessageNewListener = createListenerMiddleware();

conversationScrollOnMessageNewListener.startListening({
  matcher: appendIncomingMessageIfNew.match,
  effect: (action, listenerApi) => {
    const { message } = action.payload;
    const id = message.id?.trim() ?? '';
    const cid = message.conversationId?.trim() ?? '';
    if (!id || !cid) {
      return;
    }

    const before = listenerApi.getOriginalState() as {
      messaging: { messagesById: Record<string, unknown> };
    };
    if (before.messaging.messagesById[id]) {
      return;
    }

    listenerApi.dispatch(
      setConversationScrollTarget({
        messageId: id,
        conversationId: cid,
        reason: 'message_new',
      }),
    );
  },
});

conversationScrollOnMessageNewListener.startListening({
  matcher: replaceOptimisticMessage.match,
  effect: (action, listenerApi) => {
    const { conversationId, message } = action.payload;
    const id = message.id?.trim() ?? '';
    const cid = conversationId?.trim() ?? '';
    if (!id || !cid) {
      return;
    }
    listenerApi.dispatch(
      setConversationScrollTarget({
        messageId: id,
        conversationId: cid,
        reason: 'send_ack',
      }),
    );
  },
});
