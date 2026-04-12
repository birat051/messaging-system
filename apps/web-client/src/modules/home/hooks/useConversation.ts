import { useEffect } from 'react';
import useSWR from 'swr';
import { listMessageReceipts, listMessages } from '@/common/api';
import { useAuth } from '@/common/hooks/useAuth';
import {
  hydrateMessagesFromFetch,
  mergeReceiptSummariesFromFetch,
} from '@/modules/home/stores/messagingSlice';
import { useAppDispatch } from '@/store/hooks';

/**
 * Loads a thread via **`GET /conversations/{id}/messages`** (SWR) and **hydrates** normalized Redux state.
 * **`GET …/message-receipts`** merges into **`receiptsByMessageId`** for tick state.
 */
export function useConversation(conversationId: string | null) {
  const dispatch = useAppDispatch();
  const { user } = useAuth();

  const swr = useSWR(
    conversationId && user?.id
      ? (['conversation-messages', conversationId, user.id] as const)
      : null,
    () => listMessages(conversationId!),
    { revalidateOnFocus: false },
  );

  const receiptsSwr = useSWR(
    conversationId && user?.id
      ? (['conversation-receipts', conversationId, user.id] as const)
      : null,
    () => listMessageReceipts(conversationId!),
    { revalidateOnFocus: false },
  );

  useEffect(() => {
    if (!conversationId || swr.data === undefined) {
      return;
    }
    dispatch(
      hydrateMessagesFromFetch({
        conversationId,
        messages: swr.data.items ?? [],
        currentUserId: user?.id ?? null,
      }),
    );
  }, [conversationId, dispatch, swr.data, user?.id]);

  useEffect(() => {
    if (!conversationId || receiptsSwr.data === undefined) {
      return;
    }
    dispatch(
      mergeReceiptSummariesFromFetch({
        conversationId,
        items: receiptsSwr.data.items ?? [],
      }),
    );
  }, [conversationId, dispatch, receiptsSwr.data]);

  return {
    isLoading: swr.isLoading,
    isValidating: swr.isValidating,
    error: swr.error,
    mutate: swr.mutate,
    data: swr.data,
  };
}
